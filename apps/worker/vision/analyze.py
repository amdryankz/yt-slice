import argparse
from collections import deque
from dataclasses import dataclass
import json
from pathlib import Path
from queue import SimpleQueue
import re
import signal
import subprocess
from threading import Thread
import wave

import cv2
import mediapipe as mp
import numpy as np


SCENE_THRESHOLD = 0.28
SAMPLE_HZ = 12
DETECT_EVERY = 0.25
MAX_TRACK_AGE = 0.5
MAX_FACES = 6

Box = tuple[float, float, float, float]
FRAME_PTS = re.compile(r"\bframe:\d+\s+pts:(-?\d+)\b")
SCENE_SCORE = "lavfi.scene_score="


@dataclass
class Track:
    box: Box
    seen: float


def overlap(left: Box, right: Box) -> float:
    x, y, w, h = left
    a, b, c, d = right
    intersection = max(0, min(x + w, a + c) - max(x, a)) * max(0, min(y + h, b + d) - max(y, b))
    union = w * h + c * d - intersection
    return intersection / union if union > 0 else 0


def match_boxes(tracks: dict[int, Track], boxes: list[Box]) -> dict[int, int]:
    pairs = []
    for box_index, box in enumerate(boxes):
        scores = sorted(((overlap(track.box, box), track_id) for track_id, track in tracks.items()), reverse=True)
        if not scores or scores[0][0] < 0.2:
            continue
        score, track_id = scores[0]
        if len(scores) > 1 and score - scores[1][0] < 0.06:
            continue
        pairs.append((score, box_index, track_id))

    matched = {}
    used_tracks = set()
    for _, box_index, track_id in sorted(pairs, reverse=True):
        if track_id not in used_tracks:
            matched[box_index] = track_id
            used_tracks.add(track_id)
    return matched


def face_box(xs, ys) -> Box:
    x, y = max(0.0, min(xs)), max(0.0, min(ys))
    return x, y, max(0.0, min(1.0, max(xs)) - x), max(0.0, min(1.0, max(ys)) - y)


def lip_opening(landmarks, width, height):
    def distance(first, second):
        a, b = landmarks[first], landmarks[second]
        return np.hypot((a.x - b.x) * width, (a.y - b.y) * height)

    # Measure the inner lips in pixels relative to the distance between the outer eyes.
    eye_span = distance(33, 263)
    if eye_span < 2:
        return None
    gap = (2 * distance(13, 14) + distance(82, 87) + distance(312, 317)) / 4
    return min(1, float(3 * gap / eye_span))


def face_region(picture, box):
    height, width = picture.shape[:2]
    x, y, w, h = box
    pad_x, pad_y = w * 0.25, h * 0.25
    left, top = max(0, round((x - pad_x) * width)), max(0, round((y - pad_y) * height))
    right, bottom = min(width, round((x + w + pad_x) * width)), min(height, round((y + h + pad_y) * height))
    return np.ascontiguousarray(picture[top:bottom, left:right])


def speech_activity(audio):
    if audio is None:
        return None
    with wave.open(str(audio), "rb") as file:
        if file.getnchannels() != 1 or file.getsampwidth() != 2:
            raise ValueError("Framing audio must be 16-bit mono PCM")
        rate = file.getframerate()
        samples = np.frombuffer(file.readframes(file.getnframes()), dtype="<i2").astype(np.float32)

    # Reuse the same zero-based audio as the caption request, so silence between words
    # cannot turn a listener's reaction into evidence of speech.
    block = max(1, rate // 25)
    blocks = np.pad(samples, (0, (-len(samples)) % block)).reshape(-1, block)
    levels = np.sqrt(np.mean(blocks * blocks, axis=1))
    floor = max(64, np.percentile(levels, 95) * 0.12) if len(levels) else 64
    audible = levels >= floor

    def at_time(time):
        index = int(time * rate / block)
        return bool(np.any(audible[max(0, index - 1): index + 2]))

    return at_time


def collect_timestamps(stderr, samples, diagnostics):
    pts = None
    try:
        for raw_line in stderr:
            line = raw_line.decode(errors="replace").strip()
            match = FRAME_PTS.search(line) if "Parsed_metadata" in line else None
            if match:
                pts = int(match[1])
            elif SCENE_SCORE in line and pts is not None:
                samples.put((pts, float(line.split(SCENE_SCORE, 1)[1])))
                pts = None
            else:
                diagnostics.append(line)
    finally:
        samples.put(None)


def read_picture(pipe):
    magic = pipe.readline()
    if not magic:
        return None
    if magic != b"P6\n":
        raise ValueError("Invalid PPM header from FFmpeg")
    width, height = map(int, pipe.readline().split())
    if pipe.readline() != b"255\n":
        raise ValueError("Unexpected PPM bit depth")
    size = width * height * 3
    pixels = pipe.read(size)
    if len(pixels) != size:
        raise ValueError("Incomplete frame from FFmpeg")
    return np.frombuffer(pixels, dtype=np.uint8).reshape(height, width, 3)


def sample_frames(ffmpeg, video, square_pixel_filter):
    # select scores every input frame, and includes cuts between normal sample times.
    filters = (
        f"{square_pixel_filter},scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,"
        f"settb=AVTB,select='isnan(prev_selected_t)+gt(floor(t*{SAMPLE_HZ}),floor(prev_selected_t*{SAMPLE_HZ}))"
        f"+gte(scene,{SCENE_THRESHOLD})',metadata=mode=print:key=lavfi.scene_score"
    )
    command = [ffmpeg, "-hide_banner", "-nostats", "-nostdin", "-filter_threads", "1", "-threads", "2",
               "-i", video, "-map", "0:v:0", "-an", "-vf", filters,
               "-c:v", "ppm", "-threads:v", "1", "-fps_mode", "passthrough", "-f", "image2pipe", "pipe:1"]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    samples = SimpleQueue()
    diagnostics = deque(maxlen=12)
    reader = Thread(target=collect_timestamps, args=(process.stderr, samples, diagnostics), daemon=True)
    reader.start()

    try:
        while (picture := read_picture(process.stdout)) is not None:
            sample = samples.get()
            if sample is None:
                raise RuntimeError("FFmpeg did not emit a timestamp for a sampled frame")
            pts, score = sample
            yield pts, score >= SCENE_THRESHOLD, picture
        if process.wait() != 0:
            reader.join()
            raise RuntimeError("FFmpeg frame sampling failed\n" + "\n".join(diagnostics))
        if samples.get() is not None:
            raise RuntimeError("FFmpeg returned more timestamps than frames")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        reader.join()
        process.stdout.close()
        process.stderr.close()


def analyze(sampled_frames, models, audible_at):
    cv2.setNumThreads(1)
    yunet = cv2.FaceDetectorYN.create(str(models / "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.72)
    model_options = mp.tasks.BaseOptions(model_asset_path=str(models / "face_landmarker.task"))
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=model_options,
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_faces=MAX_FACES,
    )
    landmarker = None
    region_landmarker = None
    tracks: dict[int, Track] = {}
    frames = []
    next_track = 0
    next_detection = 0.0
    last_pts = -1
    width, height = 0, 0

    try:
        for pts, cut, picture in sampled_frames:
            if pts < 0 or pts <= last_pts:
                continue
            last_pts = pts
            time = pts / 1_000_000
            frame_height, frame_width = picture.shape[:2]
            if frames and (width, height) != (frame_width, frame_height):
                raise ValueError("Video dimensions changed during framing analysis")
            width, height = frame_width, frame_height
            cut = cut or not frames
            if cut:
                tracks.clear()
                next_detection = time
                if landmarker is not None:
                    landmarker.close()
                    landmarker = None

            tracks = {track_id: track for track_id, track in tracks.items() if time - track.seen <= MAX_TRACK_AGE}
            seen = set()
            if time >= next_detection - 0.000001:
                yunet.setInputSize((width, height))
                _, detections = yunet.detect(cv2.cvtColor(picture, cv2.COLOR_RGB2BGR))
                boxes = []
                if detections is not None:
                    for x, y, w, h, *_ in sorted(detections, key=lambda detection: detection[-1], reverse=True)[:MAX_FACES]:
                        box = face_box((float(x / width), float((x + w) / width)),
                                       (float(y / height), float((y + h) / height)))
                        if box[2] > 0 and box[3] > 0:
                            boxes.append(box)
                matched = match_boxes(tracks, boxes)
                for index, box in enumerate(boxes):
                    track_id = matched.get(index)
                    if track_id is None:
                        track_id = next_track
                        next_track += 1
                    tracks[track_id] = Track(box, time)
                    seen.add(track_id)
                while next_detection <= time + 0.000001:
                    next_detection += DETECT_EVERY

            mouths = {}
            if tracks:
                if landmarker is None:
                    landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=picture)
                result = landmarker.detect_for_video(image, pts // 1000)
                boxes = [face_box([point.x for point in face], [point.y for point in face])
                         for face in result.face_landmarks]
                for index, track_id in match_boxes(tracks, boxes).items():
                    if track_id not in seen:
                        previous = tracks[track_id].box
                        box = tuple(0.4 * old + 0.6 * new for old, new in zip(previous, boxes[index]))
                        tracks[track_id] = Track(box, time)
                    seen.add(track_id)
                    opening = lip_opening(result.face_landmarks[index], width, height)
                    if opening is not None:
                        mouths[track_id] = opening

                # Wide shots can yield only one usable face from the full-frame landmarker.
                # Give other visible YuNet tracks an independent close-up of their lips.
                for track_id, track in tracks.items():
                    if track_id in mouths or time - track.seen > DETECT_EVERY:
                        continue
                    region = face_region(picture, track.box)
                    region_height, region_width = region.shape[:2]
                    if min(region_width, region_height) < 20:
                        continue
                    if region_landmarker is None:
                        region_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(
                            mp.tasks.vision.FaceLandmarkerOptions(base_options=model_options, num_faces=1)
                        )
                    region_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=region)
                    region_result = region_landmarker.detect(region_image)
                    if region_result.face_landmarks:
                        opening = lip_opening(region_result.face_landmarks[0], region_width, region_height)
                        if opening is not None:
                            seen.add(track_id)
                            mouths[track_id] = opening

            faces = [{"track": track_id, "box": tracks[track_id].box, "mouth": mouths.get(track_id)}
                     for track_id in sorted(seen)]
            frame = {"time": time, "cut": cut, "faces": faces}
            if audible_at is not None:
                frame["audible"] = audible_at(time)
            frames.append(frame)

        if not frames:
            raise ValueError("No video frames available for framing analysis")
        return {"width": width, "height": height, "frames": frames}
    finally:
        if landmarker is not None:
            landmarker.close()
        if region_landmarker is not None:
            region_landmarker.close()


def terminate(_signum, _frame):
    raise SystemExit(1)


def main():
    signal.signal(signal.SIGTERM, terminate)
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("ffmpeg")
    parser.add_argument("square_pixel_filter")
    parser.add_argument("models", type=Path)
    parser.add_argument("--audio", type=Path)
    args = parser.parse_args()

    frames = sample_frames(args.ffmpeg, args.video, args.square_pixel_filter)
    try:
        observations = analyze(frames, args.models, speech_activity(args.audio))
        print(json.dumps(observations, allow_nan=False, separators=(",", ":")))
    finally:
        frames.close()


if __name__ == "__main__":
    main()
