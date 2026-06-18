import fs from 'node:fs';
import { createClient } from '@deepgram/sdk';

if (!process.env.DEEPGRAM_API_KEY) {
  throw new Error('DEEPGRAM_API_KEY is missing from environment variables.');
}

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export async function transcribeAudio(audioPath: string): Promise<string> {
  console.log(`[Transcriber] Starting Deepgram transcription for audio: ${audioPath}`);

  try {
    const audioBuffer = fs.readFileSync(audioPath);

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-3',
        detect_language: true,
        diarize: true,
        utterances: true,
        smart_format: true,
      }
    );

    if (error) {
      throw error;
    }

    if (!result?.results) {
      throw new Error('Deepgram returned an empty response.');
    }

    const utterances = result.results.utterances;

    if (utterances && utterances.length > 0) {
      // Format utterances into a readable transcript with timestamps
      return utterances.map(u => {
        const startSec = Math.floor(u.start);
        const min = Math.floor(startSec / 60).toString().padStart(2, '0');
        const sec = (startSec % 60).toString().padStart(2, '0');
        const speaker = u.speaker !== undefined ? `Speaker ${u.speaker}` : 'Speaker';
        return `[${min}:${sec}] ${speaker}: ${u.transcript}`;
      }).join('\n');
    }

    // Fallback if utterances are not available
    return result.results.channels[0]?.alternatives[0]?.transcript || '';
  } catch (error: any) {
    console.error('[Transcriber] Deepgram API Error:', error);
    throw new Error(`Failed to transcribe audio with Deepgram: ${error.message || error}`);
  }
}
