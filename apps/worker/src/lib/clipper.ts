import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import { createClient } from "@deepgram/sdk"
import { getRandomProxy } from "./proxy"

if (!process.env.DEEPGRAM_API_KEY) {
  throw new Error("DEEPGRAM_API_KEY is missing from environment variables.")
}

const deepgram = createClient(process.env.DEEPGRAM_API_KEY)

export async function cutVideoSegment(
  url: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  format: "original" | "crop" | "blur" = "original",
  watermarkText?: string
): Promise<void> {
  const tempPath = `${outputPath}.tmp.mp4`
  const srtPath = `${outputPath}.tmp.ass`

  console.log(`[Clipper] Downloading raw segment to ${tempPath}`)

  let lastError = '';
  let success = false;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    const proxy = getRandomProxy();
    console.log(`[Video Cut] Attempt ${attempt}/3 using proxy: ${proxy.split('@')[1] || proxy}`);
    
    const proc = Bun.spawn(
      [
        "yt-dlp",
        "--proxy",
        proxy,
        "--extractor-args",
        "youtube:client=ios",
        "--download-sections",
        `*${startTime}-${endTime}`,
        "--force-keyframes-at-cuts",
        "-S",
        "res:1080,ext:mp4:m4a",
        "-o",
        tempPath,
        url,
      ],
      {
        stderr: "pipe",
        stdout: "pipe",
      }
    )

    const errorText = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    // Drain stdout to prevent memory leaks if it gets large
    await new Response(proc.stdout).text();

    if (exitCode === 0) {
      success = true;
      break;
    }
    
    lastError = errorText;
    console.warn(`[Video Cut] Attempt ${attempt} failed.`);
    
    // Remove temp path just in case yt-dlp left partial files before retrying
    await fs.unlink(tempPath).catch(() => {});
    await fs.unlink(`${tempPath}.part`).catch(() => {});
    await fs.unlink(`${tempPath}.ytdl`).catch(() => {});
  }

  if (!success) {
    throw new Error(
      `yt-dlp clip cut failed after 3 attempts. Last Error: ${lastError}`
    )
  }

  console.log(`[Clipper] Generating subtitles via Deepgram for the segment...`)
  try {
    const audioStream = createReadStream(tempPath)
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioStream,
      {
        model: "nova-2",
        smart_format: true,
        language: "id",
      }
    )

    if (error) throw error

    const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words
    if (!words || words.length === 0)
      throw new Error("No words returned from Deepgram")

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

    type Phrase = {
      words: any[]
      start: number
      end: number
    }

    const allWords = words.map((w: any) => ({ ...w }))
    for (let i = 0; i < allWords.length - 1; i++) {
      if (allWords[i].end > allWords[i + 1].start) {
        allWords[i].end = allWords[i + 1].start
      }
    }

    function groupWords(
      words: any[],
      maxChars: number,
      maxWords: number,
      gapThreshold: number
    ): Phrase[] {
      const grouped: Phrase[] = []
      let current: any[] = []
      let currentCharCount = 0

      for (let i = 0; i < words.length; i++) {
        const word = words[i]
        const cleanWord = (word.punctuated_word || word.word).replace(
          /[.,!?]/g,
          ""
        )

        if (
          current.length > 0 &&
          currentCharCount + cleanWord.length > maxChars
        ) {
          grouped.push({
            words: current,
            start: current[0].start,
            end: current[current.length - 1].end,
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
            start: current[0].start,
            end: current[current.length - 1].end,
          })
          current = []
          currentCharCount = 0
        }

        current.push(word)
        currentCharCount += cleanWord.length + 1
      }

      if (current.length > 0) {
        grouped.push({
          words: current,
          start: current[0].start,
          end: current[current.length - 1].end,
        })
      }

      return grouped
    }

    const phrases = groupWords(allWords, 20, 5, 0.4)

    // Calculate Y position based on format to avoid TikTok UI
    const posY = format === "crop" || format === "blur" ? 1300 : 1700

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
          : phrase.words[phrase.words.length - 1].end + 0.5

        return phrase.words.map((activeWord, activeIndex) => {
          let startSeconds = activeWord.start

          let endSeconds =
            activeIndex < phrase.words.length - 1
              ? phrase.words[activeIndex + 1].start
              : Math.min(activeWord.end + 0.1, absolutePhraseEnd)

          if (startSeconds >= endSeconds) {
            endSeconds = startSeconds + 0.1
          }

          const start = formatAssTime(startSeconds)
          const end = formatAssTime(endSeconds)

          let text = phrase.words
            .map((w, wIndex) => {
              const rawWord = (w.punctuated_word || w.word).replace(
                /[.,!?]/g,
                ""
              )
              const cleanWord = sanitizeText(rawWord).toUpperCase()

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

    // Gunakan dynamic import standar ESM
    const ffmpegModule = await import("ffmpeg-static")
    const ffmpegPath = ffmpegModule.default || ffmpegModule

    let ffmpegArgs = [ffmpegPath as string, "-y", "-i", tempBasename]

    if (format === "original") {
      ffmpegArgs.push("-vf", `subtitles=${srtBasename}`)
    } else if (format === "crop") {
      ffmpegArgs.push(
        "-vf",
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${srtBasename}`
      )
    } else if (format === "blur") {
      ffmpegArgs.push(
        "-filter_complex",
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:20[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,subtitles=${srtBasename}`
      )
    }

    // Optimize video for TikTok/Shorts:
    // - Force 60fps (-r 60) for smoothness
    // - Force Constant Bitrate (CBR) of 8 Mbps to trick TikTok's algorithm into seeing it as high-quality
    // - Preset fast for good encoding speed vs compression ratio
    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-b:v",
      "8M",
      "-maxrate",
      "8M",
      "-bufsize",
      "8M",
      "-preset",
      "fast",
      "-r",
      "60",
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

    const ffmpegProc = Bun.spawn(ffmpegArgs, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })

    const ffmpegExitCode = await ffmpegProc.exited

    if (ffmpegExitCode !== 0) {
      const errorText = await new Response(ffmpegProc.stderr).text()
      throw new Error(
        `ffmpeg format conversion failed with exit code ${ffmpegExitCode}. Error: ${errorText}`
      )
    }

    await new Response(ffmpegProc.stdout).text() // Drain stdout
  } finally {
    console.log(`[Clipper] Cleaning up temporary files...`)
    await fs
      .unlink(tempPath)
      .catch((err) =>
        console.warn(`[Clipper] Failed to delete ${tempPath}:`, err)
      )
    await fs
      .unlink(srtPath)
      .catch((err) =>
        console.warn(`[Clipper] Failed to delete ${srtPath}:`, err)
      )
  }
}

export async function generateThumbnail(videoPath: string, outputPath: string, title: string) {
  const cwd = path.dirname(videoPath);
  const titlePath = `${outputPath}.title.txt`;
  
  try {
    // Write title to a temporary file to avoid complex shell escaping in FFmpeg
    // Convert to uppercase for TikTok style
    await fs.writeFile(titlePath, title.toUpperCase(), 'utf-8');

    const ffmpegModule = await import("ffmpeg-static");
    const ffmpegPath = ffmpegModule.default || ffmpegModule;

    // FFmpeg arguments to extract a frame at 0.5s and overlay centered yellow text with black background
    const ffmpegArgs = [
      ffmpegPath as string,
      "-y",
      "-ss", "00:00:00.500", // Extract at 0.5 seconds
      "-i", videoPath,
      "-vframes", "1",
      "-vf", `drawtext=textfile='${titlePath}':fontcolor=yellow:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.6:boxborderw=20`,
      "-q:v", "2", // High quality JPEG
      outputPath
    ];

    const proc = Bun.spawn(ffmpegArgs, { cwd, stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`Thumbnail generation failed: ${errorText}`);
    }
  } finally {
    // Cleanup temporary title file
    await fs.unlink(titlePath).catch(() => {});
  }
}
