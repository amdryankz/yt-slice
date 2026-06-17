export * from './queue';

export interface VideoJobPayload {
  podcastId: string;
  sourceUrl: string;
}

export interface CutClipJobPayload {
  clipId: string;
  format?: 'original' | 'crop' | 'blur';
  watermarkText?: string;
}

export interface CleanupJobPayload {}

export type AnyJobPayload = VideoJobPayload | CutClipJobPayload | CleanupJobPayload;
