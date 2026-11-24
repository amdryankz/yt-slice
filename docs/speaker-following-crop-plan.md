# Speaker-following crop for Clipper

Add **Vertical Fill (9:16 · Follow Speaker)** as an opt-in format beside the current centered **Vertical Fill (9:16 Crop)**. Both export a full 1080 × 1920 frame. The new mode holds a steady crop on the person speaking, reframes on a confirmed speaker change or sustained movement outside the safe area, and centers when no face can be framed. The current Preview plays the selected time range in the source player. Users see speaker framing on the rendered clip and thumbnail in the first release. [Format selector](../apps/web/components/ClipCard.tsx) · [Source preview](../apps/web/components/PodcastDetailClient.tsx)

## Use the clip's existing speech timestamps

The podcast ingest already requests Deepgram diarization, then rounds timestamps down to whole seconds when it builds the transcript for Gemini. The export worker already transcribes the exact downloaded segment again for caption timing. For the new format, enable diarization on that existing export request and retain each word's start, end, speaker ID, and speaker confidence when available. Build speaker turns from the original word timings before caption layout adjusts them. This gives existing podcasts and edited clip ranges the same path, with one clip transcription request and no database migration. Verify `diarize_model=v2` with the installed SDK during the spike. The installed types expose speaker fields and the older `diarize` option. [Podcast transcription](../apps/worker/src/lib/transcriber.ts) · [Clip transcription](../apps/worker/src/lib/clipper.ts) · [Deepgram diarization](https://developers.deepgram.com/docs/diarization)

## Detect faces and match them to speaker turns

1. **Find cuts and sample frames.** Analyze the downloaded segment on the worker. Use decoded presentation timestamps and align audio and video to the same clip timeline, accounting for stream offsets. Use FFmpeg's `select` scene scores on every decoded frame of a downscaled analysis stream to mark hard cuts. Run YuNet `face_detection_yunet_2023mar.onnx` at roughly 4 fps, on the opening frame, and on the first frame of each detected shot. Reset tracking at every cut. [FFmpeg scene selection](https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect) · [OpenCV YuNet model notes](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
2. **Measure mouth motion.** Run `face_landmarker.task` in MediaPipe `VIDEO` mode at roughly 12 fps and match its landmarks to the YuNet tracks by overlap. When the wide frame misses a face's landmarks, run MediaPipe on that face's padded region. Measure the inner-lip gap relative to the outer-eye span, then compare opening and closing motion over a short window. [Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Python) · [Python timestamp API](https://developers.google.com/edge/api/mediapipe/python/mp/tasks/vision/FaceLandmarker#detect_for_video)
3. **Decide who is visible and speaking.** Compare every visible face's lip motion during the timed words. Use the clip's audio level to exclude quiet samples. A diarized speaker change helps confirm a handoff. When the same label spans two people, require a stronger and longer lead in lip motion before handing off. Reconfirm after cuts and use short lookahead to establish the opening crop. Brief reactions and ambiguous speech leave the crop in place. [Deepgram speaker labels](https://developers.deepgram.com/docs/diarization)

## Plan and render camera movement

Keep `planFraming` a deterministic TypeScript function. It takes timestamped face observations, speaker turns, shot boundaries, and source geometry, and returns a fixed 9:16 crop size and timestamped positions with hold, ease, or cut transitions. Normalize rotation and pixel aspect ratio consistently between analysis and rendering. Work in display coordinates, then clamp crop origins to frame bounds before encoding.

Ease when the crop travels up to one third of the visible frame in the direction of movement. For larger moves, jump straight to the target crop on the chosen frame.

| Situation | Crop behavior |
| --- | --- |
| Confirmed speaker stays inside the inner safe area | Hold the crop through small head movements and brief pauses. |
| Confirmed new speaker in the same shot | Reframe on the new face after a sustained match. Start tuning around 400 ms of evidence. |
| Tracked face moves past the safe area | After a short dwell, reframe to recover the face and headroom. |
| Hard cut | Reset the old crop at the first frame of the new shot. Start on a confident face or center. |
| No clear match, silence, or an off-camera speaker | Hold the last reliable position while that face is visible. At an unassigned shot start or after a brief tracking dropout becomes a sustained loss, use center. |

Apply the plan using FFmpeg's per-frame `crop` expressions on the reconciled timeline before the output frame-rate conversion. Scale to 1080 × 1920 and burn in the existing vertical captions and watermark after framing. Reuse the planned crop at the thumbnail's sampled frame and keep the thumbnail title treatment. Timed words with missing speaker labels use the local audio level and lip motion. A clip without timed words, or an unavailable vision analyzer, yields a centered vertical clip. Keep any available captions and watermark. Log why framing fell back and retain the existing failure behavior for export errors such as a failed download or encode. [FFmpeg crop](https://ffmpeg.org/ffmpeg-filters.html#crop) · [Video and thumbnail filters](../apps/worker/src/lib/clipper.ts)

## Implementation order

1. **Prove the speaker match on footage.** Use representative Indonesian and multilingual clips with a wide two-person shot, listener reactions, visible speaker changes, off-camera speech, and hard cuts. Label expected speakers and cut frames. Verify the SDK's diarization request, the exact post-cut frame, and the audio/video clock on a nonzero clip offset and variable-frame-rate input. Compare the 4 fps and 12 fps starting rates for accuracy and CPU cost on the worker VPS.
2. **Integrate the worker.** Use a bounded Python subprocess for OpenCV and MediaPipe in a worker-only virtual environment. Pin package versions and model checksums. Pass observations back to Bun for `planFraming` and reuse the crop plan in both video and thumbnail rendering. Keep job files in an attempt-specific temp directory, clean up in `finally`, and enforce an analysis timeout. Record analysis time, render time, and fallback reason in worker logs. [Cut job](../apps/worker/src/index.ts)
3. **Expose the opt-in format.** Add a shared `speaker-crop` value to the job contract, validate the requested format at the cut endpoint, and wire up the ClipCard option. Deploy the worker and models first, then enable the option behind a flag after the staging checks. Compare queue time and peak memory against the existing center crop before wider rollout. [Job contract](../packages/jobs/src/index.ts) · [Cut endpoint](../apps/web/app/api/clips/%5Bid%5D/cut/route.ts)

## Release checks

- In the labeled two-person clips, pauses, nods, smiles, and short reactions cause zero unwanted camera moves. Sustained, unambiguous turns between visible speakers move to the correct face within a provisional one-second target. Verify a handoff when both faces are visible and the transcript assigns them the same label.
- The crop resets on the first frame of a hard cut, stays still inside the safe area, and returns to center on a face-free shot. Test B-roll, off-camera speech, faces near frame edges, missed detections, absent diarization, and analyzer timeout.
- `ffprobe` confirms 1080 × 1920, square pixels, and expected audio and video timing. Check subtitle and watermark placement and verify the thumbnail uses the video crop at its sampled frame. Run the three existing formats through the same export flow as regression checks.

## Enable the format

From the repository root on the worker, use Python 3.12 to install the pinned vision packages and verify the model files. Ubuntu workers need the OpenCV runtime libraries `libGL.so.1` and `libglib-2.0.so.0`. Keep `ffprobe` on the worker's `PATH`. If the bundled FFmpeg lacks `drawtext`, provide a system FFmpeg with that filter for thumbnail titles. [OpenCV wheel setup](https://pypi.org/project/opencv-contrib-python/4.12.0.88/) · [MediaPipe wheels](https://pypi.org/project/mediapipe/0.10.32/)

```sh
python3.12 -m venv apps/worker/vision/.venv
apps/worker/vision/.venv/bin/python -m pip install -r apps/worker/vision/requirements.txt
mkdir -p apps/worker/vision/models
(
  cd apps/worker/vision/models
  curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o face_detection_yunet_2023mar.onnx
  curl -fL https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task -o face_landmarker.task
  shasum -a 256 -c <<'SHA256'
8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  face_detection_yunet_2023mar.onnx
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff  face_landmarker.task
SHA256
)
```

The worker uses those paths by default. Set `SPEAKER_CROP_PYTHON` and `SPEAKER_CROP_MODEL_DIR` in the worker environment if the assets live elsewhere. Once the worker is running with the models available, set `SPEAKER_CROP_ENABLED=true` in the web server environment and restart the web process. The format appears in the existing export dropdown.
