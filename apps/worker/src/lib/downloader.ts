import { join } from 'path';

export async function downloadAudio(url: string, workDir: string): Promise<string> {
  const outputPathTemplate = join(workDir, 'audio.%(ext)s');
  // Since we force m4a format, the final file will be named audio.m4a
  const expectedFinalPath = join(workDir, 'audio.m4a');

  const proc = Bun.spawn([
    'yt-dlp',
    '--extract-audio',
    '--audio-format',
    'm4a',
    '--js-runtimes',
    'node',
    '--cookies',
    '/var/www/clipper/cookies.txt',
    '--output',
    outputPathTemplate,
    url,
  ], {
    cwd: workDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const errorText = await new Response(proc.stderr).text();
    throw new Error(`yt-dlp failed with exit code ${exitCode}. Error: ${errorText}`);
  }

  // Drain stdout to prevent memory leaks if it gets large
  await new Response(proc.stdout).text();

  return expectedFinalPath;
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
