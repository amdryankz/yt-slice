import { join } from 'path';
import { unlink } from 'node:fs/promises';
import type { ClipFormat } from '@workspace/jobs/clip-format';
import { UnrecoverableError } from 'bullmq';
import { getProxyLabel, getProxyUrl } from './proxy';
import { getYtDlpCookieArgs } from './ytdlp';

export const followSpeakerSourceError = 'Follow Speaker requires a 720p or higher source. The worker could not download an HD stream for this clip.';

const followSpeakerAttempts = [
  { resolution: 1080, httpsOnly: true },
  { resolution: 1080, httpsOnly: true },
  { resolution: 1080 },
  { resolution: 720, httpsOnly: true },
  { resolution: 720, httpsOnly: true },
  { resolution: 720 },
  { resolution: 720, pinnedClients: true },
];

async function probeVideoSegment(path: string) {
  const proc = Bun.spawn([
    'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:stream_disposition=attached_pic',
    '-of', 'json', path,
  ], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, output, error] = await Promise.all([
    proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`Unable to inspect downloaded clip: ${error.trim()}`);

  const { streams = [] } = JSON.parse(output) as {
    streams?: { codec_type: string; width?: number; height?: number; disposition?: { attached_pic?: number } }[];
  };
  const video = streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  if (!video?.width || !video.height) {
    throw new Error('Downloaded clip has no video stream.');
  }
  return { width: video.width, height: video.height, hasAudio: streams.some((stream) => stream.codec_type === 'audio') };
}

export async function downloadVideoSegment(
  url: string,
  startTime: number,
  endTime: number,
  outputPath: string,
  format: ClipFormat,
) {
  const cookieArgs = await getYtDlpCookieArgs();
  const usedProxyHosts = new Set<string>();
  const followSpeaker = format === 'speaker-crop';
  const maxAttempts = followSpeaker ? followSpeakerAttempts.length : 10;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxy = await getProxyUrl(usedProxyHosts);
    const proxyLabel = getProxyLabel(proxy);
    const hdAttempt = followSpeaker ? followSpeakerAttempts[attempt - 1] : undefined;
    const pinnedClients = hdAttempt ? hdAttempt.pinnedClients : attempt > maxAttempts / 2;
    const preferredResolution = hdAttempt?.resolution ?? (format === 'crop' && !pinnedClients ? 2160 : 1080);
    const protocol = hdAttempt?.httpsOnly ? '[protocol=https]' : '';
    const filter = hdAttempt ? `[width>=${hdAttempt.resolution}][height>=${hdAttempt.resolution}]${protocol}` : '';
    const videoOnly = hdAttempt?.httpsOnly ? '' : `/bv${filter}`;
    const selection = `bv*${filter}+ba${protocol}/b${filter}${videoOnly}`;
    const sort = `res:${preferredResolution},ext:mp4:m4a${hdAttempt?.httpsOnly ? ',codec:avc:m4a' : ''}`;
    usedProxyHosts.add(proxyLabel.toLowerCase());
    const target = hdAttempt ? ` for ${hdAttempt.resolution}p${hdAttempt.httpsOnly ? ' over HTTPS' : ''}` : '';
    console.log(`[Video Cut] Attempt ${attempt}/${maxAttempts}${target} using proxy: ${proxyLabel}`);

    const proc = Bun.spawn([
      'yt-dlp', '--proxy', proxy, ...cookieArgs, '--js-runtimes', 'deno',
      // Keep pinned clients for retries when the default clients fail.
      ...(pinnedClients ? ['--extractor-args', 'youtube:player_client=android,web'] : []),
      ...(hdAttempt ? ['--no-playlist', '--socket-timeout', '15', '--retries', '1', '--downloader-args', 'ffmpeg_i:-rw_timeout 20000000'] : []),
      '--download-sections', `*${startTime}-${endTime}`,
      '--force-keyframes-at-cuts', '--merge-output-format', 'mp4',
      '--format', selection,
      '-S', sort,
      '-o', outputPath, url,
    ], { stdout: 'ignore', stderr: 'pipe' });

    const [exitCode, errorText] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (exitCode === 0) {
      try {
        // The section download can exit successfully even if it kept only the audio.
        const source = await probeVideoSegment(outputPath);
        if (hdAttempt && Math.min(source.width, source.height) < hdAttempt.resolution) {
          throw new Error(`Downloaded ${source.width}x${source.height}, below the ${hdAttempt.resolution}p target.`);
        }
        if (hdAttempt?.httpsOnly && !source.hasAudio) {
          throw new Error('The direct HD download is missing its audio stream.');
        }
        console.info(`[Video Cut] Verified source ${source.width}x${source.height} on attempt ${attempt}.`);
        return source;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(`[Video Cut] Attempt ${attempt} rejected: ${lastError}`);
      }
    } else {
      lastError = errorText.trim();
      console.warn(`[Video Cut] Attempt ${attempt} failed.`);
    }

    await Promise.all(['', '.part', '.ytdl'].map((suffix) => unlink(outputPath + suffix).catch(() => {})));
  }

  if (followSpeaker) {
    throw new UnrecoverableError(followSpeakerSourceError);
  }
  throw new Error(`Unable to download a video segment after ${maxAttempts} attempts. ${lastError}`);
}

export async function downloadAudio(url: string, workDir: string): Promise<string> {
  const outputPathTemplate = join(workDir, 'audio.%(ext)s');
  // Since we force m4a format, the final file will be named audio.m4a
  const expectedFinalPath = join(workDir, 'audio.m4a');

  let lastError = '';
  const cookieArgs = await getYtDlpCookieArgs();
  const usedProxyHosts = new Set<string>();
  const maxAttempts = 10;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const proxy = await getProxyUrl(usedProxyHosts);
    const proxyLabel = getProxyLabel(proxy);
    usedProxyHosts.add(proxyLabel.toLowerCase());
    console.log(`[Audio Download] Attempt ${attempt}/${maxAttempts} using proxy: ${proxyLabel}`);
    
    const proc = Bun.spawn([
      'yt-dlp',
      '--extract-audio',
      '--audio-format',
      'm4a',
      '--js-runtimes',
      'deno',
      '--proxy',
      proxy,
      ...cookieArgs,
      '--extractor-args',
      'youtube:player_client=android,web',
      '--output',
      outputPathTemplate,
      url,
    ], {
      cwd: workDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const text = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      // Drain stdout to prevent memory leaks if it gets large
      await new Response(proc.stdout).text();
      return expectedFinalPath;
    }
    
    lastError = text;
    console.warn(`[Audio Download] Attempt ${attempt} failed.`);
    // Drain stdout to prevent memory leaks if it gets large
    await new Response(proc.stdout).text();
  }

  throw new Error(`yt-dlp audio download failed after ${maxAttempts} attempts. Last Error: ${lastError}`);
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  const proc = Bun.spawn([
    'ffprobe',
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    audioPath
  ]);
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error('Failed to get audio duration with ffprobe');
  }
  
  const text = await new Response(proc.stdout).text();
  return parseFloat(text.trim());
}
