import { join } from 'path';
import { getProxyLabel, getProxyUrl } from './proxy';
import { getYtDlpCookieArgs } from './ytdlp';

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
