import test from 'node:test';
import assert from 'node:assert/strict';
import { polishLengthWarning } from './polishCheck.ts';

test('polishLengthWarning - silent while the polished text stays about as long', () => {
  assert.equal(polishLengthWarning('字'.repeat(1000), '字'.repeat(1250)), null);
  assert.equal(polishLengthWarning('字'.repeat(1000), '字'.repeat(750)), null);
  assert.equal(polishLengthWarning('', '新内容'), null);
});

test('polishLengthWarning - flags a rewrite that grew or shrank a lot and points to undo', () => {
  const grown = polishLengthWarning('字'.repeat(2917), '字'.repeat(4848));
  assert.match(grown ?? '', /2917 字变为 4848 字（\+66%）/);
  assert.match(grown ?? '', /撤销/);
  assert.match(polishLengthWarning('字'.repeat(1000), '字'.repeat(500)) ?? '', /（-50%）/);
});

test('polishLengthWarning - counts characters the way the editor does (whitespace ignored)', () => {
  assert.equal(polishLengthWarning('字\n\n'.repeat(1000), '字'.repeat(1000)), null);
});
