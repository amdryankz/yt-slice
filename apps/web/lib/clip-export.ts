import type { clips } from '@workspace/db/schema';

type Clip = typeof clips.$inferSelect;

export const exportStageLabels: Record<NonNullable<Clip['exportStage']>, string> = {
  queued: 'Queued',
  downloading: 'Downloading video',
  transcribing: 'Generating subtitles',
  rendering: 'Rendering',
  uploading: 'Uploading files',
  retrying: 'Waiting to retry',
};

export function summarizeClipExports(clips: readonly Pick<Clip, 'status'>[]) {
  let active = 0;
  let completed = 0;
  let failed = 0;

  for (const clip of clips) {
    if (clip.status === 'processing') active++;
    else if (clip.status === 'completed') completed++;
    else if (clip.status === 'failed') failed++;
  }

  const requested = active + completed + failed;
  const renderedPercent = requested > 0 ? Math.floor(completed / requested * 100) : 0;
  return { active, completed, failed, requested, renderedPercent };
}
