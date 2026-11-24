import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import { createClient } from "@deepgram/sdk"
import type { ClipFormat } from "@workspace/jobs/clip-format"
import ffmpegPath from "ffmpeg-static"
import { downloadVideoSegment } from "./downloader"
import { speakerCropFilter, speakerTurns } from "./framing"
import { analyzeSpeakerCrop } from "./speaker-vision"
import { formatSubtitleWord } from "./subtitle-text"

if (!process.env.DEEPGRAM_API_KEY) {
  throw new Error("DEEPGRAM_API_KEY is missing from environment variables.")
}

const deepgram = createClient(process.env.DEEPGRAM_API_KEY)

async function speakerAudio(ffmpeg: string, video: string): Promise<string> {
  // Start the speech clock at clip time zero, including an audio stream that starts late.
  const audio = `${video}.wav`
  const extract = Bun.spawn([
    ffmpeg, "-v", "error", "-y", "-i", video, "-map", "0:a:0", "-af", "aresample=async=1:first_pts=0",
    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio,
  ], { stdout: "ignore", stderr: "pipe" })
  const [extractCode, extractError] = await Promise.all([extract.exited, new Response(extract.stderr).text()])
  if (extractCode !== 0) throw new Error(`Unable to extract clip audio: ${extractError.trim()}`)
  return audio
}

export async function cutVideoSegment(
  url: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  format: ClipFormat = "original",
  watermarkText?: string
): Promise<string | undefined> {
  if (!ffmpegPath) throw new Error("Bundled FFmpeg is unavailable")
  const tempPath = `${outputPath}.tmp.mp4`
  const srtPath = `${outputPath}.tmp.ass`
  const followSpeaker = format === "speaker-crop"
  const verticalFill = followSpeaker || format === "crop"

  console.log(`[Clipper] Downloading raw segment to ${tempPath}`)
  const { hasAudio } = await downloadVideoSegment(url, startTime, endTime, tempPath, format)

  console.log(`[Clipper] Generating subtitles via Deepgram for the segment...`)
  let turns: ReturnType<typeof speakerTurns> = []
  let framingAudio: string | undefined
  try {
    if (followSpeaker && hasAudio) framingAudio = await speakerAudio(ffmpegPath, tempPath)
    const speechPath = followSpeaker ? framingAudio : tempPath
    const options = {
      model: "nova-3",
      smart_format: true,
      language: "multi",
      ...(followSpeaker ? { diarize_model: "v2" } : {}),
    }
    const { result, error } = speechPath
      ? await deepgram.listen.prerecorded.transcribeFile(createReadStream(speechPath), options)
      : { result: null, error: null }

    if (error) throw error

    const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words ?? []
    if (words.length === 0 && !followSpeaker)
      throw new Error("No words returned from Deepgram")
    if (followSpeaker) turns = speakerTurns(words)

    function sanitizeText(value: string) {
      return value
        .replace(/\\/g, "\\\\")
        .replace(/{/g, "\\{")
        .replace(/}/g, "\\}")
        .replace(/\n/g, " ")
    }

    function formatAssTime(seconds: number) {
      const clamped = Math.max(0, seconds)
      const hours = Math.floor(clamped / 3600)
      const minutes = Math.floor((clamped % 3600) / 60)
        .toString()
        .padStart(2, "0")
      const secs = Math.floor(clamped % 60)
        .toString()
        .padStart(2, "0")
      const centis = Math.floor((clamped - Math.floor(clamped)) * 100)
        .toString()
        .padStart(2, "0")
      return `${hours}:${minutes}:${secs}.${centis}`
    }

    const allWords = words.map((word) => ({ ...word, text: formatSubtitleWord(word) }))
    type SubtitleWord = (typeof allWords)[number]
    type Phrase = {
      words: SubtitleWord[]
      start: number
      end: number
    }

    for (let i = 0; i < allWords.length - 1; i++) {
      const word = allWords[i]!
      word.end = Math.min(word.end, allWords[i + 1]!.start)
    }

    function groupWords(
      words: SubtitleWord[],
      maxChars: number,
      maxWords: number,
      gapThreshold: number
    ): Phrase[] {
      const grouped: Phrase[] = []
      let current: SubtitleWord[] = []
      let currentCharCount = 0

      for (const word of words) {
        if (
          current.length > 0 &&
          currentCharCount + word.text.length > maxChars
        ) {
          grouped.push({
            words: current,
            start: current[0]!.start,
            end: current.at(-1)!.end,
          })
          current = []
          currentCharCount = 0
        }

        const previous = current.at(-1)
        const isPunctuation =
          previous && /[.!?,:;]$/.test(previous.punctuated_word ?? "")
        const isPause = previous && word.start - previous.end > gapThreshold
        const isMaxWords = current.length >= maxWords

        const shouldBreak = isMaxWords || isPunctuation || isPause

        if (shouldBreak && current.length > 0) {
          grouped.push({
            words: current,
            start: current[0]!.start,
            end: current.at(-1)!.end,
          })
          current = []
          currentCharCount = 0
        }

        current.push(word)
        currentCharCount += word.text.length + 1
      }

      if (current.length > 0) {
        grouped.push({
          words: current,
          start: current[0]!.start,
          end: current.at(-1)!.end,
        })
      }

      return grouped
    }

    const phrases = groupWords(allWords, 20, 5, 0.4)

    // Calculate Y position based on format to avoid TikTok UI
    const posY = format === "original" ? 1700 : 1300

    const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Impact,60,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,8,4,2,80,80,0,1
Style: Watermark,Arial,25,&H50FFFFFF,&H000000FF,&H50000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,8,40,40,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

    const assEvents = phrases
      .flatMap((phrase, pIndex) => {
        const nextPhrase = phrases[pIndex + 1]
        const absolutePhraseEnd = nextPhrase
          ? nextPhrase.start
          : phrase.end + 0.5

        return phrase.words.map((activeWord, activeIndex) => {
          let startSeconds = activeWord.start

          let endSeconds =
            phrase.words[activeIndex + 1]?.start ??
            Math.min(activeWord.end + 0.1, absolutePhraseEnd)

          if (startSeconds >= endSeconds) {
            endSeconds = startSeconds + 0.1
          }

          const start = formatAssTime(startSeconds)
          const end = formatAssTime(endSeconds)

          let text = phrase.words
            .map((w, wIndex) => {
              const cleanWord = sanitizeText(w.text).toUpperCase()

              if (wIndex === activeIndex) {
                return `{\\c&H00FFFF&}${cleanWord}{\\c&HFFFFFF&}`
              }
              return cleanWord
            })
            .join(" ")

          // Force absolute positioning to completely disable libass collision stacking
          text = `{\\an2\\pos(540,${posY})}${text}`

          return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`
        })
      })
      .join("\n")

    let finalEvents = assEvents
    if (watermarkText && watermarkText.trim() !== "") {
      // Add watermark event spanning from 00:00:00.00 to 9:59:59.99
      // ASS uses Alignment 8 for top-center, handled by the style.
      finalEvents += `\nDialogue: 0,0:00:00.00,9:59:59.99,Watermark,,0,0,0,,${watermarkText.trim()}`
    }

    await fs.writeFile(srtPath, assHeader + finalEvents + "\n")
    console.log(
      `[Clipper] Viral ASS subtitles generated and saved to ${srtPath}`
    )
  } catch (error: any) {
    console.error("[Clipper] Failed to generate subtitles:", error)
    throw new Error(`Subtitle generation failed: ${error.message || error}`)
  }

  console.log(
    `[Clipper] Applying format '${format}' and burning subtitles via ffmpeg to ${outputPath}`
  )

  try {
    const cwd = path.dirname(outputPath)
    const tempBasename = path.basename(tempPath)
    const srtBasename = path.basename(srtPath)
    const outBasename = path.basename(outputPath)

    const speakerFilter = followSpeaker ? await analyzeSpeakerCrop(ffmpegPath, tempPath, turns, {
      audioPath: framingAudio,
      durationSeconds: endTime - startTime,
    }) : undefined
    const ffmpegArgs = [ffmpegPath, "-y", "-i", tempBasename]

    if (speakerFilter) {
      ffmpegArgs.push("-map", "0:V:0", "-map", "0:a:0?", "-vf", `${speakerFilter},subtitles=${srtBasename}`)
    } else if (format === "original") {
      ffmpegArgs.push("-vf", `subtitles=${srtBasename}`)
    } else if (format === "crop") {
      ffmpegArgs.push(
        "-vf",
        `${speakerCropFilter()},subtitles=${srtBasename}`
      )
    } else if (format === "blur") {
      ffmpegArgs.push(
        "-filter_complex",
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,subtitles=${srtBasename}`
      )
    }

    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      // Preserve detail through the vertical resize and keep the original frame cadence.
      ...(verticalFill
        ? ["-crf", "17", "-fps_mode:v", "vfr", "-enc_time_base:v", "1:90000"]
        : ["-b:v", "8M", "-maxrate", "8M", "-bufsize", "8M", "-r", "60"]),
      "-preset",
      verticalFill ? "medium" : "fast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outBasename
    )

    const renderStart = performance.now()
    const ffmpegProc = Bun.spawn(ffmpegArgs, {
      cwd,
      stdout: "ignore",
      stderr: "pipe",
    })

    const [ffmpegExitCode, errorText] = await Promise.all([ffmpegProc.exited, new Response(ffmpegProc.stderr).text()])

    if (ffmpegExitCode !== 0) {
      throw new Error(
        `ffmpeg format conversion failed with exit code ${ffmpegExitCode}. Error: ${errorText}`
      )
    }

    console.log(`[Clipper] Rendered '${format}' in ${Math.round(performance.now() - renderStart)} ms`)
    return speakerFilter
  } finally {
    console.log(`[Clipper] Cleaning up temporary subtitles...`)
    await fs
      .unlink(srtPath)
      .catch((err) =>
        console.warn(`[Clipper] Failed to delete ${srtPath}:`, err)
      )
  }
}

function wrapText(text: string, maxLen: number) {
  const words = text.split(' ');
  let lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + word).length > maxLen) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines.join('\n'); // Write actual newline characters to the file
}

let thumbnailFFmpeg: Promise<string> | undefined;

function getThumbnailFFmpeg(): Promise<string> {
  const bundled = ffmpegPath;
  if (!bundled) return Promise.resolve("ffmpeg");

  return thumbnailFFmpeg ??= (async () => {
    const proc = Bun.spawn([bundled, "-hide_banner", "-filters"], { stdout: "pipe", stderr: "ignore" });
    const [exitCode, filters] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    return exitCode === 0 && /^\s*[.A-Z]+\s+drawtext\s/m.test(filters) ? bundled : "ffmpeg";
  })().catch(() => "ffmpeg");
}

export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  title: string,
  format: ClipFormat = "original",
  speakerFilter?: string,
) {
  const cwd = path.dirname(videoPath);
  const titlePath = `${outputPath}.title.txt`;
  
  try {
    // Dynamic settings based on format
    const maxLen = format === "original" ? 25 : 12;
    const fontSize = format === "original" ? 140 : 100;

    // Write word-wrapped title to a temporary file
    // Convert to uppercase for TikTok style
    const wrappedTitle = wrapText(title.toUpperCase(), maxLen);
    await fs.writeFile(titlePath, wrappedTitle, 'utf-8');

    const thumbnailBinary = await getThumbnailFFmpeg();
    const followSpeaker = format === "speaker-crop";

    let filterGraph = "";
    
    // Apply the same video format scaling as the main video
    if (followSpeaker || format === "crop") {
      filterGraph += `${speakerFilter ?? speakerCropFilter()},`;
    } else if (format === "blur") {
      filterGraph += "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,";
    }

    // Visual Enhancements: Color correction and vignette
    filterGraph += "eq=contrast=1.05:saturation=1.3,vignette=PI/4,";

    // Add drawtext with thick border (stroke), drop shadow, and line spacing
    filterGraph += `drawtext=textfile='${titlePath}':expansion=none:fontcolor=yellow:fontsize=${fontSize}:borderw=10:bordercolor=black:shadowx=6:shadowy=6:shadowcolor=black@0.9:line_spacing=20:x=(w-text_w)/2:y=(h-text_h)/2`;

    // Output seeking lets the crop see the original timestamp of the thumbnail frame.
    const seeks = ["0.5", "0"];
    for (const seek of seeks) {
      const inputArgs = followSpeaker
        ? ["-i", videoPath, "-ss", seek, "-map", "0:V:0"]
        : ["-ss", seek, "-i", videoPath];
      const proc = Bun.spawn([
        thumbnailBinary, "-y", ...inputArgs, "-vframes", "1",
        format === "blur" ? "-filter_complex" : "-vf", filterGraph, "-q:v", "2", outputPath,
      ], { cwd, stdout: "ignore", stderr: "pipe" });
      const [exitCode, errorText] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
      if (exitCode === 0 && await fs.stat(outputPath).then((file) => file.size > 0, () => false)) return;
      if (seek === seeks.at(-1) && exitCode !== 0) throw new Error(`Thumbnail generation failed: ${errorText}`);
    }
    throw new Error("Thumbnail generation produced no frame");
  } finally {
    // Cleanup temporary title file
    await fs.unlink(titlePath).catch(() => {});
  }
}
