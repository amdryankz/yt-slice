# Project language for clip titles and captions

After the [speaker-following crop work](speaker-following-crop-plan.md), add a required **Title and caption language** field to the project creation form. The choices are **English** and **Bahasa Indonesia**. The selected language controls the suggested clip titles and social captions, including hashtags and the full-video footer. Each clip card opens directly on the selected caption, with edit and copy actions for that caption. The project name comes from the **Project Title** field exactly as entered.

For example, a project titled `Obrolan Minggu Ini` can use Indonesian audio and English clip titles and social captions. Deepgram still transcribes the spoken Indonesian, and the exported clip uses Indonesian subtitles. The transcript and its speaker timing feed clip selection and speaker framing. [Project form](../apps/web/components/PodcastForm.tsx) · [Transcription](../apps/worker/src/lib/transcriber.ts) · [Subtitle export](../apps/worker/src/lib/clipper.ts)

## Implementation order

1. **Save the form choice.** Add `contentLanguage` to the project as `en` or `id`. Validate the choice in the creation endpoint and save it with the project. Use a nullable column so existing projects and queued jobs can use the current language behavior. Apply the migration before starting the updated web app and worker. [Creation endpoint](../apps/web/app/api/podcasts/route.ts) · [Database schema](../packages/db/src/schema.ts)
2. **Use the saved language for generation.** Read it from the project during initial generation and regeneration. For projects with a saved language, update the Gemini prompt and response schema to generate one title and one caption in that language. Use a localized title fallback if needed. Keep the current clip selection and timestamp checks. Store the English caption in `captionEn` and the Indonesian caption in `caption`, using the existing fields. [Gemini prompt](../apps/worker/src/lib/gemini.ts) · [Worker jobs](../apps/worker/src/index.ts)
3. **Show and edit the selected caption.** Pass the saved language from the project to each clip card. Display that language’s caption with a localized source footer and use the same text for copying. Save edits to the matching caption field. Use the project language for manual clips’ default titles and captions as well. The thumbnail takes its title from the clip at export. [Clip card](../apps/web/components/ClipCard.tsx) · [Caption formatting](../apps/web/lib/caption.ts) · [Manual clips](../apps/web/app/api/podcasts/%5Bid%5D/clips/route.ts)
4. **Keep existing captions accessible.** Projects created before the field was added keep their saved titles, both caption versions, and the caption switcher. They open on Bahasa Indonesia as they do today. New projects use the single caption selected at creation.

## Acceptance checks

- An Indonesian video submitted with **English** selected shows English suggested titles, captions, hashtags, and footer on first load. The project name matches the typed title and exported subtitles follow the audio.
- An English video submitted with **Bahasa Indonesia** selected shows Indonesian suggested titles and captions. The exported subtitles follow the English audio.
- Regeneration, manual clips, caption edits, copying, and page reloads use the project’s saved language. The copied caption contains the source link once.
- Existing projects still open and can access both saved captions. An unsupported or missing language on new submissions returns a validation error.
