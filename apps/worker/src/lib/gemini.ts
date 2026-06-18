import {
  GoogleGenAI,
  Type,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai"
import { z } from "zod"

// Ensure the API key is available
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from environment variables.")
}

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

export const clipSuggestionInputSchema = z.object({
  reasoning: z.string().catch(""),
  title: z.string().catch("Judul Klip Menarik"),
  startTime: z.string().describe("Start time in MM:SS format").catch("00:00"),
  endTime: z.string().describe("End time in MM:SS format").catch("00:15"),
  viralityScore: z.number().min(1).max(100).catch(50),
  explanation: z.string().catch(""),
  caption: z.string().catch("#podcast"),
})

export const clipArraySchema = z
  .array(clipSuggestionInputSchema)
  .transform((clips) => {
    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(":").map(Number)
      if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
      if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
      return parseInt(timeStr, 10) || 0
    }

    return clips.map((clip) => ({
      title: clip.title,
      startTime: parseTime(clip.startTime),
      endTime: parseTime(clip.endTime),
      viralityScore: clip.viralityScore,
      explanation: clip.explanation,
      caption: clip.caption,
    }))
  })

export type ClipSuggestion = z.infer<typeof clipArraySchema>[number]

export async function analyzeTranscript(
  transcript: string,
  durationSeconds: number,
  stricter = false
): Promise<ClipSuggestion[]> {
  console.log("[Gemini] Analyzing transcript. Length:", transcript.length)

  const durationMin = Math.floor(durationSeconds / 60)
  const durationSec = Math.floor(durationSeconds % 60)
  const durationFormatted = `${durationMin}:${durationSec.toString().padStart(2, "0")}`

  const systemPrompt = `
You are an expert short-form video editor who creates viral clips for TikTok, YouTube Shorts, and Instagram Reels. Identify 5 viral-worthy clips from the provided transcript.

## Audience & context
The primary audience is Indonesian. Prioritize moments that would trend on Indonesian Twitter/X or TikTok — controversial opinions, public figure drama, social commentary, religious discourse, or humor that resonates locally. A clip that only makes sense to a global audience but not Indonesians is not valuable.

## What makes a clip viral
- A hook in the first 3 seconds that stops the scroll — a bold claim, surprising statement, or emotional moment
- A complete, self-contained narrative arc with a clear beginning, point, and conclusion
- High emotional intensity: controversy, humor, surprise, outrage, profound insight, or vulnerability
- Topical relevance — the moment touches on something people are currently talking about

## CRITICAL: Clean cut points
Every clip MUST start and end cleanly:
- START at the natural beginning of a thought or sentence. 
- END after the speaker fully completes their point. Never cut mid-sentence, mid-thought, or before a punchline lands.
- If a powerful moment doesn't have clean boundaries within the target duration, expand slightly rather than cutting awkwardly.
- CRITICAL: The total duration of this audio file is ${durationFormatted} (${durationSeconds} seconds). DO NOT generate any timestamps that exceed ${durationFormatted}.
- You MUST copy the exact timestamps written in the transcript. Assume the transcript input is formatted with timestamps like [MM:SS]. Do not invent or calculate timestamps that do not exist in the text.
- Use ONLY real timestamps from the transcript in MM:SS format.

## What to AVOID
- Clips that start mid-conversation where the viewer has no idea what's being discussed
- Clips that end abruptly before the speaker finishes their sentence or reaction
- Out-of-context quotes that misrepresent what the speaker is saying
- Reaction-only clips with no substance (just laughing, nodding, or filler)
- Moments that only make sense if you watched the full video

## Scoring guide (viralityScore 1-100)
- 90-100: Would go viral standalone — shocking statement, perfect comedic timing, or emotionally gripping
- 70-89: Highly engaging — strong opinion, interesting insight, or compelling story beat
- 50-69: Decent content but lacks a strong hook or needs more context
- 1-49: Filler, low energy, or incomplete thought — do not return clips scored below 50

## Output format
All output values (title, explanation, and caption) MUST be written entirely in Bahasa Indonesia. The caption should include relevant Indonesian hashtags.

You MUST format your response as a JSON array of exactly 5 objects.

Each object must match this exact structure:
{
  "reasoning": "Think step-by-step: why this clip is viral-worthy, what makes the hook work, why these cut points form a complete moment, and verify the timestamps.",
  "title": "Catchy, clickbait-style title (<=60 chars)",
  "startTime": "02:15",
  "endTime": "03:00",
  "viralityScore": 95,
  "explanation": "Explanation of the context and the opening phrase that grabs attention",
  "caption": "An SEO-optimized caption with relevant hashtags"
}

## Constraints
- Target clip length: 30 to 180 seconds
- No overlapping clips
- Prefer single-speaker moments with clear narrative arcs
  `.trim()

  const clipSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        reasoning: { type: Type.STRING },
        title: { type: Type.STRING },
        startTime: { type: Type.STRING },
        endTime: { type: Type.STRING },
        viralityScore: { type: Type.INTEGER },
        explanation: { type: Type.STRING },
        caption: { type: Type.STRING },
      },
      required: [
        "reasoning",
        "title",
        "startTime",
        "endTime",
        "viralityScore",
        "explanation",
        "caption",
      ],
    },
  }

  let rawJson = ""

  // 3. Generate content with retries
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[Gemini] Generation attempt ${attempt}...`)
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `Here is the transcript:\n${transcript}`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: clipSchema,
          temperature: stricter ? 0.2 : 0.7,
          maxOutputTokens: 8000,
          // tools: [{ googleSearch: {} }],
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
          ],
        },
      })

      rawJson = response.text || ""

      // Strip markdown code blocks if the AI accidentally wrapped the JSON (just in case)
      rawJson = rawJson
        .replace(/^```json\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim()

      if (!rawJson) {
        throw new Error("Gemini returned an empty response.")
      }

      // Try to parse and validate within the try block so failures trigger a retry
      const parsedData = JSON.parse(rawJson)
      const validatedData = clipArraySchema.parse(parsedData)

      return validatedData.slice(0, 5) // Success, exit and return
    } catch (error) {
      console.warn(
        `[Gemini] Attempt ${attempt} failed:`,
        (error as Error).message
      )
      if (attempt === 3) {
        throw new Error(
          `Failed to generate content after 3 attempts: ${(error as Error).message}`
        )
      }
      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
    }
  }

  throw new Error("Unexpected error: exited retry loop without returning.")
}
