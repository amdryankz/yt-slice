import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadVideoSegment } from './downloader';

test('discards audio-only downloads that report success and retries for real video', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clipper-download-test-'));
  const output = join(dir, 'clip.mp4');
  const env = { WEBSHARE_PROXY_URL: 'http://127.0.0.1:1', WEBSHARE_API_KEY: '', YTDLP_COOKIES_FILE: '' };
  const saved = Object.keys(env).map((key) => [key, process.env[key]] as const);
  Object.assign(process.env, env);

  let attempts = 0;
  const spawn = spyOn(Bun, 'spawn').mockImplementation((command) => {
    expect(Array.isArray(command)).toBe(true);
    const args = command as string[];
    let exited = Promise.resolve(0);
    let stdout = '';
    if (args[0] === 'yt-dlp') {
      const format = args[args.indexOf('--format') + 1];
      expect(format).toBe('bv*+ba/b/bv');
      attempts++;
      exited = writeFile(output, String(attempts), { flag: 'wx' }).then(() => 0);
    } else {
      expect(args[0]).toBe('ffprobe');
      const streams: { codec_type: string; disposition?: { attached_pic: number } }[] = [{ codec_type: 'audio' }];
      if (attempts === 2) streams.push({ codec_type: 'video', disposition: { attached_pic: 1 } });
      if (attempts === 3) streams.push({ codec_type: 'video' });
      stdout = JSON.stringify({ streams });
    }
    return { exited, stdout: new Response(stdout).body, stderr: new Response('').body } as ReturnType<typeof Bun.spawn>;
  });

  try {
    const result = await downloadVideoSegment('https://example.invalid/fixture', 0, 5, output, true);
    expect(result).toEqual({ hasAudio: true });
    expect(attempts).toBe(3);
    expect(await Bun.file(output).text()).toBe('3');
  } finally {
    spawn.mockRestore();
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
