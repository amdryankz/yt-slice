import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@deepgram/sdk';

if (!process.env.DEEPGRAM_API_KEY) {
  throw new Error('DEEPGRAM_API_KEY is missing from environment variables.');
}

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

export async function cutVideoSegment(
  url: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  format: 'original' | 'crop' | 'blur' = 'original',
  watermarkText?: string
): Promise<void> {
  const tempPath = `${outputPath}.tmp.mp4`;
  const srtPath = `${outputPath}.tmp.ass`;

  console.log(`[Clipper] Downloading raw segment to ${tempPath}`);

  const ytDlpProc = Bun.spawn([
    "yt-dlp",
    "-f",
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
    "--download-sections",
    `*${startTime}-${endTime}`,
    "--force-keyframes-at-cuts",
    "-o",
    tempPath,
    url
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const ytDlpExitCode = await ytDlpProc.exited;

  if (ytDlpExitCode !== 0) {
    const errorText = await new Response(ytDlpProc.stderr).text();
    throw new Error(`yt-dlp clip cut failed with exit code ${ytDlpExitCode}. Error: ${errorText}`);
  }

  await new Response(ytDlpProc.stdout).text(); // Drain stdout

  console.log(`[Clipper] Generating subtitles via Deepgram for the segment...`);
  try {
    const audioBuffer = readFileSync(tempPath);
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
      model: 'nova-2',
      smart_format: true,
      language: 'id',
    });

    if (error) throw error;

    const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words;
    if (!words || words.length === 0) throw new Error('No words returned from Deepgram');

    const chunks = [];
    let currentChunk: any[] = [];

    for (const wordObj of words) {
      currentChunk.push(wordObj);
      const isPunctuation = /[.!?]$/.test(wordObj.punctuated_word || '');
      const isPause = currentChunk.length > 1 && (wordObj.start - currentChunk[currentChunk.length - 2].end > 0.4);

      // Break chunk at 5 words, or on punctuation, or significant pause
      if (currentChunk.length >= 5 || isPunctuation || isPause) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    const formatAssTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
      const s = Math.floor(seconds % 60).toString().padStart(2, '0');
      const cs = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
      return `${h}:${m}:${s}.${cs}`;
    };

    const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,95,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,4,2,40,40,400,1
Style: Watermark,Arial,45,&H50FFFFFF,&H000000FF,&H50000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,40,40,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const assEvents = chunks.map(chunk => {
      const start = formatAssTime(chunk[0].start);
      const end = formatAssTime(chunk[chunk.length - 1].end);
      // Clean up text
      const text = chunk.map(w => w.punctuated_word || w.word).join(' ').toUpperCase();
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    }).join('\n');

    let finalEvents = assEvents;
    if (watermarkText && watermarkText.trim() !== '') {
      // Add watermark event spanning from 00:00:00.00 to 9:59:59.99
      // ASS uses Alignment 8 for top-center, handled by the style.
      finalEvents += `\nDialogue: 0,0:00:00.00,9:59:59.99,Watermark,,0,0,0,,${watermarkText.trim()}`;
    }

    await fs.writeFile(srtPath, assHeader + finalEvents + '\n');
    console.log(`[Clipper] Viral ASS subtitles generated and saved to ${srtPath}`);
  } catch (error: any) {
    console.error('[Clipper] Failed to generate subtitles:', error);
    throw new Error(`Subtitle generation failed: ${error.message || error}`);
  }

  console.log(`[Clipper] Applying format '${format}' and burning subtitles via ffmpeg to ${outputPath}`);

  try {
    const cwd = path.dirname(outputPath);
    const tempBasename = path.basename(tempPath);
    const srtBasename = path.basename(srtPath);
    const outBasename = path.basename(outputPath);

    // Import ffmpeg-static dynamically so it only runs in the worker
    const ffmpegPath = require('ffmpeg-static');

    let ffmpegArgs = [ffmpegPath, "-y", "-i", tempBasename];

    if (format === 'original') {
      ffmpegArgs.push("-vf", `subtitles=${srtBasename}`);
    } else if (format === 'crop') {
      ffmpegArgs.push("-vf", `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${srtBasename}`);
    } else if (format === 'blur') {
      ffmpegArgs.push(
        "-filter_complex",
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,subtitles=${srtBasename}`
      );
    }

    // Re-encode video with subtitles, copy audio
    ffmpegArgs.push("-c:v", "libx264", "-c:a", "copy", outBasename);

    const ffmpegProc = Bun.spawn(ffmpegArgs, {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const ffmpegExitCode = await ffmpegProc.exited;

    if (ffmpegExitCode !== 0) {
      const errorText = await new Response(ffmpegProc.stderr).text();
      throw new Error(`ffmpeg format conversion failed with exit code ${ffmpegExitCode}. Error: ${errorText}`);
    }

    await new Response(ffmpegProc.stdout).text(); // Drain stdout
  } finally {
    console.log(`[Clipper] Cleaning up temporary files...`);
    await fs.unlink(tempPath).catch((err) => console.warn(`[Clipper] Failed to delete ${tempPath}:`, err));
    await fs.unlink(srtPath).catch((err) => console.warn(`[Clipper] Failed to delete ${srtPath}:`, err));
  }
}
