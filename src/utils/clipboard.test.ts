import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from './clipboard.ts';

test('copyText - uses the async clipboard API when it works', async () => {
  let written = '';
  const ok = await copyText('全书正文', { writeText: async (t) => { written = t; }, legacyCopy: () => false });
  assert.equal(ok, true);
  assert.equal(written, '全书正文');
});

test('copyText - falls back to the legacy copy when the API is denied or missing', async () => {
  let legacy = '';
  const denied = await copyText('a', { writeText: async () => { throw new Error('NotAllowedError'); }, legacyCopy: (t) => { legacy = t; return true; } });
  assert.equal(denied, true);
  assert.equal(legacy, 'a');
  assert.equal(await copyText('b', { legacyCopy: () => true }), true);
});

test('copyText - reports failure instead of pretending it copied', async () => {
  assert.equal(await copyText('c', { writeText: async () => { throw new Error('denied'); }, legacyCopy: () => false }), false);
  assert.equal(await copyText('d', { legacyCopy: () => { throw new Error('no document'); } }), false);
});
