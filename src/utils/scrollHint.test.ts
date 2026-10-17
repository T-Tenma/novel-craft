import test from 'node:test';
import assert from 'node:assert/strict';
import { getScrollHint, scrollHintMask } from './scrollHint.ts';

test('getScrollHint - a row that fits needs no hint', () => {
  assert.deepEqual(getScrollHint(0, 320, 320), { left: false, right: false });
});

test('getScrollHint - more buttons to the right at the start, to the left at the end', () => {
  assert.deepEqual(getScrollHint(0, 320, 600), { left: false, right: true });
  assert.deepEqual(getScrollHint(140, 320, 600), { left: true, right: true });
  assert.deepEqual(getScrollHint(280, 320, 600), { left: true, right: false });
});

test('getScrollHint - ignores sub-pixel rounding at either end', () => {
  assert.deepEqual(getScrollHint(0.4, 320, 600.6), { left: false, right: true });
  assert.deepEqual(getScrollHint(279.6, 320, 600), { left: true, right: false });
});

test('scrollHintMask - fades only the side that still has hidden content', () => {
  assert.equal(scrollHintMask({ left: false, right: false }), undefined);
  assert.equal(scrollHintMask({ left: false, right: true }), 'linear-gradient(to right, black, black calc(100% - 24px), transparent)');
  assert.equal(scrollHintMask({ left: true, right: false }), 'linear-gradient(to right, transparent, black 24px, black)');
});

test('getScrollHint - a few pixels short of the end (container padding after scrollIntoView) counts as the end', () => {
  assert.deepEqual(getScrollHint(54, 208, 264), { left: true, right: false });
  assert.deepEqual(getScrollHint(3, 208, 264), { left: false, right: true });
});
