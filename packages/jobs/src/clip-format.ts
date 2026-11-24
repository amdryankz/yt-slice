export type ClipFormat = 'original' | 'crop' | 'blur' | 'speaker-crop';

export function isClipFormat(value: unknown): value is ClipFormat {
  return value === 'original' || value === 'crop' || value === 'blur' || value === 'speaker-crop';
}
