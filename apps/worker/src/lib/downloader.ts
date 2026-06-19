import { join } from 'path';
import { getRandomProxy } from './proxy';

export async function downloadAudio(url: string, workDir: string): Promise<string> {
  const outputPathTemplate = join(workDir, 'audio.%(ext)s');
  // Since we force m4a format, the final file will be named audio.m4a
  const expectedFinalPath = join(workDir, 'audio.m4a');

  let lastError = '';
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    const proxy = getRandomProxy();
    console.log(`[Audio Download] Attempt ${attempt}/3 using proxy: ${proxy.split('@')[1] || proxy}`);
    
    const proc = Bun.spawn([
      'yt-dlp',
      '--extract-audio',
      '--audio-format',
      'm4a',
      '--js-runtimes',
      'deno',
      '--proxy',
      proxy,
      '--extractor-args',
      'youtube:client=ios',
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

  throw new Error(`yt-dlp audio download failed after 3 attempts. Last Error: ${lastError}`);
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
