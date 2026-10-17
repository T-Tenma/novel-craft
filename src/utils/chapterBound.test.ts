import test from 'node:test';
import assert from 'node:assert/strict';
import { boundTo } from './chapterBound.ts';

const result = { chapterId: 'chap-1', data: { score: 80 } };

test('boundTo - shows a result only on the chapter it was produced for', () => {
  assert.deepEqual(boundTo(result, 'chap-1'), { score: 80 });
  assert.equal(boundTo(result, 'chap-2'), null, 'switching chapters must not show the previous chapter verdict');
});

test('boundTo - nothing produced yet', () => {
  assert.equal(boundTo(null, 'chap-1'), null);
});
