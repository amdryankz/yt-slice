import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClipFormat } from '@workspace/jobs/clip-format';
import { downloadVideoSegment } from './downloader';

const url = 'https://example.invalid/fixture';
const audio = { codec_type: 'audio' };
const cover = { codec_type: 'video', width: 1280, height: 720, disposition: { attached_pic: 1 } };
const sd = { codec_type: 'video', width: 640, height: 360 };
const hd = { codec_type: 'video', width: 1280, height: 720 };
const fullHd = { codec_type: 'video', width: 1920, height: 1080 };

async function withDownloads(
  files: Array<Array<typeof audio | typeof cover> | number>,
  check: (download: (format: ClipFormat) => ReturnType<typeof downloadVideoSegment>, attempts: string[][], output: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'clipper-download-test-'));
  const output = join(dir, 'clip.mp4');
  const env = { WEBSHARE_PROXY_URL: 'http://127.0.0.1:1', WEBSHARE_API_KEY: '', YTDLP_COOKIES_FILE: '' };
  const saved = Object.keys(env).map((key) => [key, process.env[key]] as const);
  Object.assign(process.env, env);

  const attempts: string[][] = [];
  const spawn = spyOn(Bun, 'spawn').mockImplementation((command) => {
    expect(Array.isArray(command)).toBe(true);
    const args = command as string[];
    let exited = Promise.resolve(0);
    let stdout = '';
    if (args[0] === 'yt-dlp') {
      const file = files[attempts.length] ?? files.at(-1);
      attempts.push(args);
      exited = typeof file === 'number'
        ? Promise.resolve(file)
        : writeFile(output, String(attempts.length), { flag: 'wx' }).then(() => 0);
    } else {
      expect(args[0]).toBe('ffprobe');
      stdout = JSON.stringify({ streams: files[attempts.length - 1] ?? files.at(-1) });
    }
    return { exited, stdout: new Response(stdout).body, stderr: new Response('').body } as ReturnType<typeof Bun.spawn>;
  });

  try {
    await check((format) => downloadVideoSegment(url, 0, 5, output, format), attempts, output);
  } finally {
    spawn.mockRestore();
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test('retries audio-only and attached-cover downloads for existing formats', async () => {
  await withDownloads([[audio], [audio, cover], [audio, sd]], async (download, attempts, output) => {
    expect(await download('crop')).toEqual({ width: 640, height: 360, hasAudio: true });
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toContain('bv*+ba/b/bv');
    expect(await Bun.file(output).text()).toBe('3');
  });
});

test('Follow Speaker keeps the verified 1080p source when available', async () => {
  await withDownloads([[audio, fullHd]], async (download, attempts) => {
    expect(await download('speaker-crop')).toEqual({ width: 1920, height: 1080, hasAudio: true });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toContain('res:1080,ext:mp4:m4a,codec:avc:m4a');
  });
});

test('Follow Speaker rejects SD and falls back from 1080p to 720p', async () => {
  await withDownloads([[audio, sd], 1, 1, [audio, hd]], async (download, attempts) => {
    expect(await download('speaker-crop')).toEqual({ width: 1280, height: 720, hasAudio: true });
    expect(attempts).toHaveLength(4);
    expect(attempts[0]).toContain('res:1080,ext:mp4:m4a,codec:avc:m4a');
    expect(attempts[3]).toContain('res:720,ext:mp4:m4a,codec:avc:m4a');
    for (const [index, args] of attempts.entries()) {
      const resolution = index < 3 ? 1080 : 720;
      const selector = args[args.indexOf('--format') + 1]!;
      expect(selector.split('/').every((branch) => branch.includes(`[width>=${resolution}][height>=${resolution}]`))).toBe(true);
    }
  });
});

test('Follow Speaker reports a source-quality error when only SD downloads succeed', async () => {
  await withDownloads([[audio, sd]], async (download, attempts, output) => {
    await expect(download('speaker-crop')).rejects.toThrow('Follow Speaker requires a 720p or higher source.');
    expect(attempts.length).toBeGreaterThan(3);
    expect(await Bun.file(output).exists()).toBe(false);
  });
});
