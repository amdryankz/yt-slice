import { expect, test } from 'bun:test'
import { planFraming, speakerTurns, type FaceObservation, type FramingFrame } from './framing'

function face(track: number, x: number, mouth: number): FaceObservation {
  return { track, box: [x, 0.24, 0.08, 0.24], mouth }
}

function shot(length: number, observation: (index: number) => FramingFrame['faces']): FramingFrame[] {
  return Array.from({ length }, (_, index) => ({ time: index / 10, cut: index === 0, faces: observation(index) }))
}

function plan(frames: FramingFrame[], words: Parameters<typeof speakerTurns>[0]) {
  return planFraming({ width: 1280, height: 720, frames }, speakerTurns(words))
}

const speechMotion = (index: number) => index % 2 ? 0.12 : 0.33

test('follows sustained diarized turns without switching to a listener reaction or short interjection', () => {
  const frames = shot(32, (index) => [
    face(0, 0.16 + (index % 3) / 400, index < 18 ? speechMotion(index) : 0.12),
    face(1, 0.76, index >= 18 ? speechMotion(index) : index === 8 ? 0.9 : 0.12),
  ])
  const moves = plan(frames, [
    { speaker: 0, start: 0, end: 0.8 },
    { speaker: 1, start: 0.85, end: 1 },
    { speaker: 0, start: 1.05, end: 1.8 },
    { speaker: 1, start: 1.8, end: 3.2 },
  ])

  expect(moves).toHaveLength(2)
  expect(moves[0]?.to.x).toBeLessThan(0.2)
  expect(moves[1]?.time).toBeGreaterThanOrEqual(2.2)
  expect(moves[1]?.time).toBeLessThan(2.7)
  expect(moves[1]?.to.x).toBeGreaterThan(0.8)
  expect(moves[1]?.duration).toBe(0)
})

test('eases between nearby speakers in the same shot', () => {
  const frames = shot(28, (index) => [
    face(0, 0.16, index < 12 ? speechMotion(index) : 0.12),
    face(1, 0.255, index >= 12 ? speechMotion(index) : 0.12),
  ])
  const moves = plan(frames, [
    { speaker: 0, start: 0, end: 1.2 },
    { speaker: 1, start: 1.2, end: 2.8 },
  ])

  expect(moves).toHaveLength(2)
  expect(moves[1]?.to.x).toBeGreaterThan(moves[0]!.to.x)
  expect(moves[1]?.duration).toBeGreaterThan(0)
})

test('hands off between two visible faces when diarization assigns them the same speaker label', () => {
  const frames = shot(61, (index) => [
    face(0, 0.16, index < 16 || index >= 40 ? speechMotion(index) : 0.12),
    face(1, 0.76, index >= 16 && index < 40 ? speechMotion(index) : 0.12),
  ]).map((frame) => ({ ...frame, audible: true }))
  const moves = plan(frames, [{ speaker: 0, start: 0, end: 6.1 }])

  expect(moves).toHaveLength(3)
  expect(moves[0]?.to.x).toBeLessThan(0.2)
  expect(moves[1]?.to.x).toBeGreaterThan(0.8)
  expect(moves[1]?.time).toBeLessThan(2.7)
  expect(moves[2]?.to.x).toBeLessThan(0.2)
  expect(moves[2]?.time).toBeLessThan(5.1)
  expect(moves.map((move) => move.duration)).toEqual([0, 0, 0])
})

test('does not finish a pending handoff on stale lip motion during a pause', () => {
  const frames = shot(32, (index) => [
    face(0, 0.16, index < 12 ? speechMotion(index + 1) : 0.12),
    face(1, 0.76, index >= 13 && index < 19 ? speechMotion(index + 1) : 0.12),
  ]).map((frame, index) => ({ ...frame, audible: index < 19 || index >= 21 }))
  const moves = plan(frames, [{ speaker: 0, start: 0, end: 3.2 }])

  expect(moves).toHaveLength(1)
  expect(moves[0]?.to.x).toBeLessThan(0.2)
})

test('keeps a listener reaction outside audible speech from changing the crop', () => {
  const frames = shot(41, (index) => [
    face(0, 0.16, index < 14 || index >= 28 ? speechMotion(index) : 0.12),
    face(1, 0.76, index >= 15 && index <= 26 ? speechMotion(index) : 0.12),
  ]).map((frame) => ({ ...frame, audible: frame.time < 1.4 || frame.time >= 2.8 }))
  const moves = plan(frames, [{ speaker: 0, start: 0, end: 4.1 }])

  expect(moves).toHaveLength(1)
  expect(moves[0]?.to.x).toBeLessThan(0.2)
})

test('uses audible speech timing and visible motion when the transcript has no speaker ID', () => {
  const frames = shot(15, (index) => [face(0, 0.16, speechMotion(index)), face(1, 0.76, 0.12)])
  const words = [{ start: 0, end: 1.5 }]

  expect(plan(frames, words)[0]?.to.x).toBe(0.5)
  expect(plan(frames.map((frame) => ({ ...frame, audible: true })), words)[0]?.to.x).toBeLessThan(0.2)
})

test('holds through a detection gap and resets on the first frame of a faceless shot', () => {
  const frames = shot(24, (index) => {
    if ((index >= 9 && index <= 11) || index >= 16) return []
    return [face(0, 0.16, speechMotion(index))]
  })
  frames[16]!.cut = true

  const moves = plan(frames, [{ speaker: 0, start: 0, end: 2.4 }])
  expect(moves).toHaveLength(2)
  expect(moves[1]).toMatchObject({ time: 1.6, duration: 0, to: { x: 0.5, y: 0.5 } })
})

test('uses short lookahead when a word starts just after the first frame', () => {
  const frames = shot(15, (index) => [face(0, 0.16, speechMotion(index))])
  const moves = plan(frames, [{ speaker: 0, start: 0.12, end: 1.5 }])

  expect(moves).toHaveLength(1)
  expect(moves[0]?.to.x).toBeLessThan(0.2)
  expect(moves[0]?.time).toBe(0)
})

test('recenters for a sustained loss inside a shot and ignores off-camera speech', () => {
  const frames = shot(28, (index) => [
    ...(index < 17 ? [face(0, 0.16, index < 12 ? speechMotion(index) : 0.12)] : []),
    face(1, 0.76, index === 14 ? 0.9 : 0.12),
  ])
  const moves = plan(frames, [
    { speaker: 0, start: 0, end: 1.2 },
    { speaker: 2, start: 1.2, end: 2.8 },
  ])

  expect(moves).toHaveLength(2)
  expect(moves[1]?.time).toBeGreaterThanOrEqual(2.1)
  expect(moves[1]?.to.x).toBe(0.5)
})

test.each([
  ['eases for a small move', 0.255, true],
  ['jumps for a large move', 0.53, false],
] as const)('%s after the same face leaves the safe area', (_name, destination, shouldEase) => {
  const frames = shot(23, (index) => [face(0, index >= 10 ? destination : 0.16, speechMotion(index))])
  const moves = plan(frames, [{ speaker: 0, start: 0, end: 2.3 }])

  expect(moves).toHaveLength(2)
  expect(moves[1]?.time).toBeGreaterThanOrEqual(1.22)
  expect(moves[1]?.to.x).toBeGreaterThan(moves[0]!.to.x)
  expect(Boolean(moves[1]?.duration)).toBe(shouldEase)
})

test('centers when mouth motion is ambiguous, the labels overlap, or diarization is missing', () => {
  const frames = shot(15, (index) => [face(0, 0.16, speechMotion(index)), face(1, 0.78, speechMotion(index))])
  const labeled = [{ speaker: 0, start: 0, end: 1.5 }]
  const overlapping = [...labeled, { speaker: 1, start: 0, end: 1.5 }]
  const unlabeled = [{ speaker: 0, speaker_confidence: 0.1, start: 0, end: 1.5 }]

  for (const words of [labeled, overlapping, unlabeled, []]) {
    expect(plan(frames, words)).toEqual([
      { time: 0, duration: 0, from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 } },
    ])
  }
})
