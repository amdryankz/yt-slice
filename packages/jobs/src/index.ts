export * from './queue';
export * from './pubsub';

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

export interface RegenerateJobPayload {
  podcastId: string;
}

export type AnyJobPayload = VideoJobPayload | CutClipJobPayload | CleanupJobPayload | RegenerateJobPayload;
