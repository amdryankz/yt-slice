export const SQUARE_PIXELS_FILTER = "scale=w='max(2,round(iw*sar/2)*2)':h=ih,setsar=1"
const VERTICAL_SCALE = 'scale=1080:1920:force_original_aspect_ratio=increase:force_divisible_by=2:flags=lanczos,format=yuv420p'

const MIN_TURN_SECONDS = 0.4
const EVIDENCE_SECONDS = 0.75
const OPENING_PAUSE_SECONDS = 0.18
const MAX_WORD_GAP = 0.32
const LIP_MOVEMENT_THRESHOLD = 0.012
const MAX_LIP_EVIDENCE_AGE = 0.22
const SAME_LABEL_DWELL = 0.32
const FACE_LOSS_SECONDS = 0.5
const EDGE_DWELL_SECONDS = 0.22
const EASE_SECONDS = 0.28
const MAX_EASE_DISTANCE = 1 / 3

export interface FaceObservation {
  track: number
  box: [x: number, y: number, width: number, height: number]
  mouth: number | null
}

export interface FramingFrame {
  time: number
  cut: boolean
  audible?: boolean
  faces: FaceObservation[]
}

export interface FramingObservations {
  width: number
  height: number
  frames: FramingFrame[]
}

interface SpeakerWord {
  start: number
  end: number
  speaker?: number
  speaker_confidence?: number
}

interface SpeakerTurn {
  start: number
  end: number
  speaker: number | null
}

interface Position {
  x: number
  y: number
}

interface CropMove {
  time: number
  from: Position
  to: Position
  duration: number
}

interface MotionFrame extends FramingFrame {
  activity: Map<number, number>
}

const CENTER: Position = { x: 0.5, y: 0.5 }

export function speakerTurns(words: readonly SpeakerWord[]): SpeakerTurn[] {
  const turns: SpeakerTurn[] = []
  const ordered = [...words].sort((left, right) => left.start - right.start)
  let previous: SpeakerTurn | undefined

  for (const word of ordered) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start) continue
    const speaker = typeof word.speaker === 'number' && Number.isInteger(word.speaker) &&
      word.speaker >= 0 && (word.speaker_confidence ?? 1) >= 0.45 ? word.speaker : null

    if (previous && word.start - previous.end <= MAX_WORD_GAP &&
        (previous.speaker === speaker || previous.speaker === null || speaker === null)) {
      previous.speaker ??= speaker
      previous.end = Math.max(previous.end, word.end)
    } else {
      previous = { start: word.start, end: word.end, speaker }
      turns.push(previous)
    }
  }

  return turns
}

function activeTurn(turns: SpeakerTurn[], time: number): SpeakerTurn | undefined {
  let active: SpeakerTurn | undefined
  for (const turn of turns) {
    if (turn.start > time) break
    if (turn.end <= time) continue
    if (active && active.speaker !== turn.speaker) return undefined
    active = turn
  }
  return active
}

function measureMotion(frames: FramingFrame[]): MotionFrame[] {
  const previous = new Map<number, { time: number; mouth: number }>()

  return frames.map((frame) => {
    const activity = new Map<number, number>()
    for (const face of frame.faces) {
      if (face.mouth === null) continue
      const last = previous.get(face.track)
      if (last && frame.time - last.time <= 0.22) {
        const change = face.mouth - last.mouth
        activity.set(face.track, Math.sign(change) * Math.min(Math.abs(change), 0.25))
      }
      previous.set(face.track, { time: frame.time, mouth: face.mouth })
    }
    return { ...frame, activity }
  })
}

function matchFace(
  faces: FaceObservation[],
  evidence: MotionFrame[],
  turns: SpeakerTurn[],
  turn: SpeakerTurn,
  until: number,
) {
  const windowStart = Math.max(turn.start, until - EVIDENCE_SECONDS)
  const scores = faces.map((face) => {
    let activeCount = 0
    let motionCount = 0
    let baselineCount = 0
    let activeMotion = 0
    let baselineMotion = 0
    let lastDirection = 0
    let directionChanges = 0
    let lastLipMovement = -Infinity

    for (const frame of evidence) {
      const movement = frame.activity.get(face.track)
      if (movement === undefined) continue
      const active = activeTurn(turns, frame.time)
      const magnitude = Math.abs(movement)
      if (active === turn && frame.time >= windowStart && frame.time <= until &&
          frame.audible !== false && (turn.speaker !== null || frame.audible === true)) {
        activeCount++
        activeMotion += magnitude
        if (magnitude >= LIP_MOVEMENT_THRESHOLD) {
          motionCount++
          lastLipMovement = frame.time
          const direction = Math.sign(movement)
          if (lastDirection !== 0 && direction !== lastDirection) directionChanges++
          lastDirection = direction
        }
      } else if ((active?.speaker !== turn.speaker || frame.audible === false) &&
          frame.time < windowStart && frame.time >= windowStart - 1) {
        baselineCount++
        baselineMotion += magnitude
      }
    }

    const score = activeCount >= 3 && motionCount >= 3 && directionChanges > 0 &&
      until - lastLipMovement <= MAX_LIP_EVIDENCE_AGE
      ? Math.max(0, activeMotion / activeCount - 0.5 * baselineMotion / Math.max(1, baselineCount))
      : 0
    return { face, score, directionChanges }
  }).sort((left, right) => right.score - left.score)

  const best = scores[0]
  const otherScore = scores[1]?.score ?? 0
  if (best && best.score >= 0.016 && best.score - otherScore >= Math.max(0.009, otherScore * 0.25)) {
    return { ...best, otherScore }
  }
}

function clamp(value: number, max = 1) {
  return Math.max(0, Math.min(max, value))
}

function targetPosition(face: FaceObservation, width: number, height: number): Position {
  const [x, y, faceWidth, faceHeight] = face.box
  return {
    x: width >= 1 ? CENTER.x : clamp((x + faceWidth / 2 - width / 2) / (1 - width)),
    y: height >= 1 ? CENTER.y : clamp((y + faceHeight / 2 - 0.42 * height) / (1 - height)),
  }
}

function outsideSafeArea(face: FaceObservation, pos: Position, width: number, height: number) {
  const [x, y, faceWidth, faceHeight] = face.box
  const left = pos.x * (1 - width)
  const top = pos.y * (1 - height)
  return (width < 1 && (x < left + 0.10 * width || x + faceWidth > left + 0.90 * width)) ||
    (height < 1 && (y < top + 0.08 * height || y + faceHeight > top + 0.76 * height))
}

function positionDuring(move: CropMove, time: number): Position {
  const progress = move.duration ? clamp((time - move.time) / move.duration) : 1
  const eased = progress * progress * (3 - 2 * progress)
  return {
    x: move.from.x + (move.to.x - move.from.x) * eased,
    y: move.from.y + (move.to.y - move.from.y) * eased,
  }
}

export function planFraming({ width, height, frames }: FramingObservations, turns: SpeakerTurn[]): CropMove[] {
  const moves: CropMove[] = []
  const ratio = width / height
  const cropWidth = Math.min(1, (9 / 16) / ratio)
  const cropHeight = Math.min(1, ratio / (9 / 16))
  const shots: FramingFrame[][] = []

  for (const frame of frames) {
    if (frame.cut || shots.length === 0) shots.push([])
    shots.at(-1)!.push(frame)
  }

  for (const shot of shots) {
    const motion = measureMotion(shot)
    const first = motion[0]!
    const shotTurns = turns.filter((turn) => turn.end > first.time && turn.start <= motion.at(-1)!.time)
    const openingTurn = activeTurn(shotTurns, first.time) ?? shotTurns.find((turn) =>
      turn.start > first.time && turn.start <= first.time + OPENING_PAUSE_SECONDS &&
      activeTurn(shotTurns, turn.start) === turn)
    const openingUntil = Math.min(first.time + EVIDENCE_SECONDS, openingTurn?.end ?? Infinity)
    const openingFace = openingTurn && openingTurn.end - Math.max(openingTurn.start, first.time) >= MIN_TURN_SECONDS
      ? matchFace(first.faces, motion.filter((frame) => frame.time <= openingUntil), shotTurns, openingTurn, openingUntil)?.face
      : undefined
    const openingPosition = openingFace ? targetPosition(openingFace, cropWidth, cropHeight) : CENTER
    let move: CropMove = { time: first.time, from: openingPosition, to: openingPosition, duration: 0 }
    moves.push(move)

    let framedTrack = openingFace?.track
    let framedSpeaker = openingFace ? openingTurn?.speaker : undefined
    let candidate: { track: number; since: number } | undefined
    let lastSeen = first.time
    let edgeSince: number | undefined
    let evidenceStart = 0
    let turn: SpeakerTurn | undefined = openingTurn
    let turnSince = first.time

    for (let index = 1; index < motion.length; index++) {
      const frame = motion[index]!
      const active = activeTurn(shotTurns, frame.time)
      if (active !== turn) {
        if (active?.speaker !== turn?.speaker) candidate = undefined
        turn = active
        turnSince = frame.time
      }
      while (motion[evidenceStart]!.time < frame.time - EVIDENCE_SECONDS - 1) evidenceStart++
      const match = turn && frame.time - turnSince >= MIN_TURN_SECONDS - 0.000001
        ? matchFace(frame.faces, motion.slice(evidenceStart, index + 1), shotTurns, turn, frame.time)
        : undefined
      const previousFace = frame.faces.find((face) => face.track === framedTrack)
      let target: FaceObservation | undefined
      if (match && turn) {
        const changedLabel = turn.speaker != null && framedSpeaker != null && turn.speaker !== framedSpeaker
        if (framedTrack === undefined || match.face.track === framedTrack || changedLabel) {
          if (frame.audible !== false) target = match.face
          candidate = undefined
        } else if (match.directionChanges >= 2 && match.score >= Math.max(0.026, match.otherScore * 1.7 + 0.008)) {
          // A label can span multiple visible speakers. Require sustained lip evidence
          // to correct it without chasing a smile or a quick listener reaction.
          if (candidate?.track !== match.face.track) candidate = { track: match.face.track, since: frame.time }
          if (frame.audible !== false && frame.time - candidate.since >= SAME_LABEL_DWELL) target = match.face
        } else {
          candidate = undefined
        }
      } else {
        candidate = undefined
      }
      if (target) framedSpeaker = turn?.speaker
      const trackedFace = target ?? previousFace
      let destination: Position | undefined

      if (trackedFace) {
        lastSeen = frame.time
        if (trackedFace.track !== framedTrack) {
          framedTrack = trackedFace.track
          candidate = undefined
          edgeSince = undefined
          destination = targetPosition(trackedFace, cropWidth, cropHeight)
        } else if (outsideSafeArea(trackedFace, move.to, cropWidth, cropHeight)) {
          edgeSince ??= frame.time
          if (frame.time - edgeSince >= EDGE_DWELL_SECONDS) {
            destination = targetPosition(trackedFace, cropWidth, cropHeight)
            edgeSince = frame.time
          }
        } else {
          edgeSince = undefined
        }
      } else {
        edgeSince = undefined
        if (framedTrack !== undefined && frame.time - lastSeen >= FACE_LOSS_SECONDS) {
          framedTrack = undefined
          framedSpeaker = undefined
          destination = CENTER
        }
      }

      if (destination && Math.hypot((destination.x - move.to.x) * (1 - cropWidth),
        (destination.y - move.to.y) * (1 - cropHeight)) > 0.004) {
        const from = positionDuring(move, frame.time)
        // Measure travel relative to the visible crop from the current on-screen position.
        const travel = Math.hypot(
          (destination.x - from.x) * (1 - cropWidth) / cropWidth,
          (destination.y - from.y) * (1 - cropHeight) / cropHeight,
        )
        move = { time: frame.time, from, to: destination, duration: travel <= MAX_EASE_DISTANCE ? EASE_SECONDS : 0 }
        moves.push(move)
      }
    }
  }

  return moves
}

export function speakerCropFilter(moves: CropMove[] = []): string {
  const timeline: CropMove[] = moves[0]?.time === 0 ? moves
    : [{ time: 0, from: CENTER, to: CENTER, duration: 0 }, ...moves]

  function expression(axis: keyof Position, start: number, end: number): string {
    if (end - start > 1) {
      const middle = Math.floor((start + end) / 2)
      // t is exposed as a float by FFmpeg. Compare inside half an AVTB tick.
      return `if(lt(t,${(timeline[middle]!.time - 0.0000003).toFixed(7)}),${expression(axis, start, middle)},${expression(axis, middle, end)})`
    }

    const { time, from, to, duration } = timeline[start]!
    if (!duration || from[axis] === to[axis]) return to[axis].toFixed(6)
    return `st(0,clip((t-${time.toFixed(6)})/${duration},0,1));${from[axis].toFixed(6)}+(${(to[axis] - from[axis]).toFixed(6)})*ld(0)*ld(0)*(3-2*ld(0))`
  }

  return `${SQUARE_PIXELS_FILTER},${VERTICAL_SCALE},settb=AVTB,crop=1080:1920:x='(iw-ow)*(${expression('x', 0, timeline.length)})':y='(ih-oh)*(${expression('y', 0, timeline.length)})',setsar=1`
}
