import { deepStrictEqual, strictEqual } from 'node:assert';
import { test } from 'node:test';
import { summarizeClipExports } from './clip-export';

test('reports completed, failed, and active exports without counting unrequested clips', () => {
  const clips = ['draft', 'pending', 'completed', 'failed', 'processing'].map((status) => ({ status }));
  deepStrictEqual(summarizeClipExports(clips), {
    active: 1, completed: 1, failed: 1, requested: 3, renderedPercent: 33,
  });
});

test('keeps a failed request in the total after all exports have finished', () => {
  deepStrictEqual(summarizeClipExports([{ status: 'completed' }, { status: 'failed' }]), {
    active: 0, completed: 1, failed: 1, requested: 2, renderedPercent: 50,
  });
});

test('reports an empty queue when all clips are drafts', () => {
  deepStrictEqual(summarizeClipExports([{ status: 'draft' }, { status: 'pending' }]), {
    active: 0, completed: 0, failed: 0, requested: 0, renderedPercent: 0,
  });
});

test('keeps progress below 100 percent while a requested export is incomplete', () => {
  const clips = Array.from({ length: 199 }, () => ({ status: 'completed' }));
  clips.push({ status: 'failed' });
  strictEqual(summarizeClipExports(clips).renderedPercent, 99);
});
