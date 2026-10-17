import test from 'node:test';
import assert from 'node:assert/strict';
import { appendUniqueBy, validateUniqueName, insertAt } from './collections.ts';

test('insertAt - puts the item back at its original position', () => {
  assert.deepEqual(insertAt(['a', 'c'], 1, 'b'), ['a', 'b', 'c']);
  assert.deepEqual(insertAt(['b'], 0, 'a'), ['a', 'b']);
});

test('insertAt - clamps out-of-range indexes to the ends', () => {
  assert.deepEqual(insertAt(['a'], 9, 'z'), ['a', 'z']);
  assert.deepEqual(insertAt(['a'], -3, 'z'), ['z', 'a']);
});

test('insertAt - does not mutate the input', () => {
  const list = ['a'];
  insertAt(list, 0, 'b');
  assert.deepEqual(list, ['a']);
});

const NAMES = ['林宵', 'Klein', '玄通老道'];

test('validateUniqueName - empty or whitespace names are rejected with the field label', () => {
  assert.equal(validateUniqueName({ value: '   ', existing: NAMES, label: '角色姓名' }), '请填写角色姓名');
});

test('validateUniqueName - names longer than the limit are rejected', () => {
  assert.match(validateUniqueName({ value: '名'.repeat(41), existing: [], label: '角色姓名', maxLength: 40 }) ?? '', /40/);
  assert.equal(validateUniqueName({ value: '名'.repeat(40), existing: [], label: '角色姓名', maxLength: 40 }), null);
});

test('validateUniqueName - duplicates are detected ignoring spaces and letter case', () => {
  assert.match(validateUniqueName({ value: ' klein ', existing: NAMES, label: '角色姓名' }) ?? '', /已存在.*klein/);
  assert.match(validateUniqueName({ value: '林宵', existing: NAMES, label: '角色姓名' }) ?? '', /已存在/);
});

test('validateUniqueName - editing an item does not conflict with itself', () => {
  assert.equal(validateUniqueName({ value: '林宵', existing: NAMES, label: '角色姓名', excludeIndex: 0 }), null);
  assert.match(validateUniqueName({ value: '林宵', existing: NAMES, label: '角色姓名', excludeIndex: 1 }) ?? '', /已存在/);
});

test('validateUniqueName - a valid new name passes', () => {
  assert.equal(validateUniqueName({ value: '周明瑞', existing: NAMES, label: '角色姓名' }), null);
});

const byName = (c: { name: string }) => c.name;

test('appendUniqueBy - keeps existing items and appends only new keys', () => {
  const existing = [{ name: '林宵' }, { name: '玄通老道' }];
  const result = appendUniqueBy(existing, [{ name: '克莱恩' }, { name: '林宵' }], byName);
  assert.deepEqual(result.items.map(byName), ['林宵', '玄通老道', '克莱恩']);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
});

test('appendUniqueBy - matches keys ignoring surrounding spaces and letter case', () => {
  const result = appendUniqueBy([{ name: 'Klein' }], [{ name: ' klein ' }, { name: '  ' }], byName);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 2, 'blank keys are skipped too');
});

test('appendUniqueBy - duplicates inside the incoming batch are added once', () => {
  const result = appendUniqueBy([], [{ name: '甲' }, { name: '甲' }], byName);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
});

test('appendUniqueBy - does not mutate the inputs', () => {
  const existing = [{ name: '甲' }];
  const incoming = [{ name: '乙' }];
  appendUniqueBy(existing, incoming, byName);
  assert.deepEqual(existing, [{ name: '甲' }]);
  assert.deepEqual(incoming, [{ name: '乙' }]);
});
