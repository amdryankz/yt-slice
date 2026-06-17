import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(import.meta.dirname, '../../../.env') });

if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
  console.warn("WARNING: S3 configuration is missing from .env. Uploads will fail.");
}

export const env = {
  S3_ENDPOINT: process.env.S3_ENDPOINT!,
  S3_REGION: process.env.S3_REGION || 'auto',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID!,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY!,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME!,
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL!,
};
