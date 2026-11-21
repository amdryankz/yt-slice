export type CaptionLanguage = 'id' | 'en';

export function captionFooter(sourceUrl: string, language: CaptionLanguage) {
  const label = language === 'en' ? 'Watch the full video:' : 'Tonton video selengkapnya:';
  return `📺 ${label}\n${sourceUrl}`;
}

export function formatCaptionWithUrl(caption: string | null, sourceUrl: string | undefined, language: CaptionLanguage) {
  if (!sourceUrl || caption?.includes(sourceUrl)) return caption ?? '';

  const footer = captionFooter(sourceUrl, language);
  return caption ? `${caption.trim()}\n\n${footer}` : footer;
}
