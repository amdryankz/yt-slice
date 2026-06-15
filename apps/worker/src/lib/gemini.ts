import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

// Ensure the API key is available
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is missing from environment variables.');
}

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const clipSuggestionInputSchema = z.object({
  reasoning: z.string().describe("Chain of thought explaining why this clip was chosen and verifying the timestamps."),
  title: z.string(),
  startTime: z.string().describe("Start time in MM:SS format"),
  endTime: z.string().describe("End time in MM:SS format"),
  viralityScore: z.number().min(1).max(100),
  explanation: z.string(),
  caption: z.string(),
});

export const clipArraySchema = z.array(clipSuggestionInputSchema).transform((clips) => {
  const parseTime = (timeStr: string) => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parseInt(timeStr, 10) || 0;
  };

  return clips.map(clip => ({
    title: clip.title,
    startTime: parseTime(clip.startTime),
    endTime: parseTime(clip.endTime),
    viralityScore: clip.viralityScore,
    explanation: clip.explanation,
    caption: clip.caption,
  }));
});

export type ClipSuggestion = z.infer<typeof clipArraySchema>[number];

export async function analyzeTranscript(transcript: string, durationSeconds: number): Promise<ClipSuggestion[]> {
  console.log('[Gemini] Analyzing transcript. Length:', transcript.length);

  const durationMin = Math.floor(durationSeconds / 60);
  const durationSec = Math.floor(durationSeconds % 60);
  const durationFormatted = `${durationMin}:${durationSec.toString().padStart(2, '0')}`;

  const prompt = `
You are an expert content curator and social media manager. I will provide you with a podcast transcript with timestamps.
Your task is to read the transcript and identify the 5 most engaging, emotionally resonant, or controversial segments that would make excellent viral short-form clips (TikTok, YouTube Shorts, Reels).
Prioritize narrative completeness. Ensure each segment has a clear hook at the beginning and a complete, satisfying conclusion at the end without cutting off mid-sentence. The duration should naturally fit the story, ideally between 45 seconds and a maximum of 3 minutes.

CRITICAL INSTRUCTION: The total duration of this audio file is ${durationFormatted} (${durationSeconds} seconds). 
DO NOT generate any timestamps that exceed ${durationFormatted}. 
Use ONLY real timestamps from the transcript in MM:SS format.

All output values (title, explanation, and caption) MUST be written entirely in Bahasa Indonesia. The caption should include relevant Indonesian hashtags.

Analyze the transcript and return exactly 5 clip suggestions.
You MUST format your response as a JSON array of objects. Do NOT wrap it in Markdown formatting blocks like \`\`\`json. 
Return ONLY the raw JSON array.

Each object must match this exact structure:
{
  "reasoning": "Think step-by-step about the timestamp boundaries and verify they are within the video duration of ${durationFormatted}.",
  "title": "A catchy, clickbait-style title",
  "startTime": "02:15",
  "endTime": "03:00",
  "viralityScore": 95,
  "explanation": "Why this clip works and what emotions it targets",
  "caption": "An SEO-optimized caption with relevant hashtags"
}

Here is the transcript:
${transcript}
  `.trim();

  console.log('[Gemini] Prompting gemini-3.1-flash-lite with transcript length:', transcript.length);

  // 3. Generate content
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.7,
    },
  });

  const rawJson = response.text;

  if (!rawJson) {
    throw new Error('Gemini returned an empty response.');
  }

  try {
    const parsedData = JSON.parse(rawJson);
    const validatedData = clipArraySchema.parse(parsedData);
    return validatedData.slice(0, 5);
  } catch (error) {
    console.error('Failed to parse or validate Gemini output:', rawJson);
    throw new Error(`Invalid JSON format from Gemini: ${(error as Error).message}`);
  }
}
