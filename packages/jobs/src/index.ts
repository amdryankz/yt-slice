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

export type AnyJobPayload = VideoJobPayload | CutClipJobPayload;
