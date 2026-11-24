export const contentLanguages = ['en', 'id'] as const;

export type ContentLanguage = (typeof contentLanguages)[number];

export const contentLanguageLabels: Record<ContentLanguage, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
};
