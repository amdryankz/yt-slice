import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { planFraming, speakerCropFilter, SQUARE_PIXELS_FILTER, type speakerTurns } from './framing'

const visionDir = resolve(import.meta.dir, '../../vision')
const observationsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frames: z.array(z.object({
    time: z.number().nonnegative(),
    cut: z.boolean(),
    audible: z.boolean().optional(),
    faces: z.array(z.object({
      track: z.number().int().nonnegative(),
      box: z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]),
      mouth: z.number().min(0).max(1).nullable(),
    })),
  })).min(1),
})

export async function analyzeSpeakerCrop(
  ffmpeg: string,
  video: string,
  turns: ReturnType<typeof speakerTurns>,
  { audioPath, durationSeconds }: { audioPath?: string; durationSeconds: number },
) {
  if (turns.length === 0) {
    console.info('[Framing] Using center crop because the clip has no timed speech')
    return speakerCropFilter()
  }

  const started = performance.now()
  const modelDir = resolve(process.env.SPEAKER_CROP_MODEL_DIR ?? join(visionDir, 'models'))
  const python = process.env.SPEAKER_CROP_PYTHON ?? join(visionDir, '.venv/bin/python')
  const timeoutMs = Math.round(Math.min(300_000, Math.max(120_000, durationSeconds * 2_000 + 15_000)))
  const signal = AbortSignal.timeout(timeoutMs)

  try {
    await Promise.all([
      access(join(modelDir, 'face_detection_yunet_2023mar.onnx')),
      access(join(modelDir, 'face_landmarker.task')),
    ])
    const proc = Bun.spawn([
      python, join(visionDir, 'analyze.py'), video, ffmpeg, SQUARE_PIXELS_FILTER, modelDir,
      ...(audioPath ? ['--audio', audioPath] : []),
    ], {
      stdout: 'pipe',
      stderr: 'pipe',
      signal,
      killSignal: 'SIGKILL',
      env: { ...process.env, MPLCONFIGDIR: join(dirname(video), '.matplotlib') },
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(stderr.trim().split('\n').at(-1) || `Vision exited with code ${exitCode}`)

    const observations = observationsSchema.parse(JSON.parse(stdout))
    const moves = planFraming(observations, turns)
    const filter = speakerCropFilter(moves)
    // Leave room for subtitle and thumbnail filters within the OS argument size limit.
    if (Buffer.byteLength(filter) > 96_000) throw new Error('Crop path exceeds the FFmpeg argument size budget')
    const followed = moves.some((move) => move.to.x !== 0.5 || move.to.y !== 0.5)
    const foundFaces = observations.frames.some((frame) => frame.faces.length > 0)
    const multiFaceSamples = observations.frames.filter((frame) => frame.faces.filter((face) => face.mouth !== null).length > 1).length
    const speakerLabels = new Set(turns.flatMap((turn) => turn.speaker === null ? [] : [turn.speaker])).size
    const outcome = followed ? 'Speaker crop planned'
      : foundFaces ? 'No confident off-center framing' : 'No faces detected'
    console.info(`[Framing] Analyzed ${observations.frames.length} frames (${multiFaceSamples} with multiple mouths) and ${speakerLabels} speaker labels in ${Math.round(performance.now() - started)} ms. ${outcome}.`)
    return filter
  } catch (error) {
    const reason = signal.aborted ? 'vision analysis timed out' : error instanceof Error ? error.message : String(error)
    console.warn(`[Framing] Using center crop after ${Math.round(performance.now() - started)} ms. ${reason}`)
    return speakerCropFilter()
  }
}
