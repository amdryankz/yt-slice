import { beforeAll, expect, spyOn, test } from "bun:test"
import type { ContentLanguage } from "@workspace/db/content-language"

let analyzeTranscript: typeof import("./gemini").analyzeTranscript

beforeAll(async () => {
  const originalKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = "language-test"
  try {
    const gemini = await import("./gemini")
    analyzeTranscript = gemini.analyzeTranscript
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
  }
})

async function generate(
  transcript: string,
  language: ContentLanguage | null,
  suggestion: { title?: string; caption: string; captionEn?: string },
) {
  const response = Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify([{
      ...suggestion, startTime: "00:10", endTime: "00:45", viralityScore: 90,
    }]) }] } }],
  })
  const request = spyOn(globalThis, "fetch").mockResolvedValue(response)
  try {
    const [clip] = await analyzeTranscript(transcript, 60, language)
    expect(request).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body))
    return { clip, prompt: body.systemInstruction.parts[0]?.text, schema: body.generationConfig.responseSchema.items }
  } finally {
    request.mockRestore()
  }
}

test("English projects request one English caption and use an English title fallback", async () => {
  const { clip, prompt, schema } = await generate("[00:10] Selamat datang!", "en", { caption: "A moment worth sharing. #Podcast" })

  expect(prompt).toContain("Write the title and caption in English")
  expect(schema.required).toContain("caption")
  expect(schema.properties).not.toHaveProperty("captionEn")
  expect(clip).toMatchObject({ title: "Podcast Highlight", caption: null, captionEn: "A moment worth sharing. #Podcast", startTime: 10, endTime: 45 })
})

test("Indonesian projects request one Indonesian caption and preserve the generated title", async () => {
  const { clip, prompt, schema } = await generate("[00:10] Welcome to the show!", "id", { title: "Awal Cerita", caption: "Awal yang menarik. #Podcast" })

  expect(prompt).toContain("Write the title and caption in Bahasa Indonesia")
  expect(schema.properties).not.toHaveProperty("captionEn")
  expect(clip).toMatchObject({ title: "Awal Cerita", caption: "Awal yang menarik. #Podcast", captionEn: null })
})

test("projects without a language continue to generate both caption versions", async () => {
  const { clip, schema } = await generate("[00:10] Selamat datang!", null, { caption: "Versi Indonesia", captionEn: "English version" })

  expect(schema.required).toContain("captionEn")
  expect(clip).toMatchObject({ title: "Judul Klip Menarik", caption: "Versi Indonesia", captionEn: "English version" })
})

test("keeps valid ranges when Gemini returns unusable timestamps", async () => {
  const suggestions = [
    { startTime: "00:invalid", endTime: "00:29" },
    { startTime: "00:41", endTime: "00:40" },
    { startTime: "00:40", endTime: "01:20" },
    { startTime: "00:10", endTime: "00:45" },
  ].map((range) => ({ ...range, title: "Podcast Highlight", caption: "A moment worth sharing. #Podcast" }))
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(suggestions) }] } }],
  }))
  try {
    const clips = await analyzeTranscript("[00:10] Welcome to the show!", 60, "en")
    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({ startTime: 10, endTime: 45 })
  } finally {
    request.mockRestore()
  }
})
