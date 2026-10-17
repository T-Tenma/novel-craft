import test from 'node:test';
import assert from 'node:assert/strict';
import { toNovelId, isAnalysisCacheKey, clearAnalysisCaches } from './storageKeys.ts';

test('toNovelId - matches the id scheme used by the bookshelf and SQLite', () => {
  assert.equal(toNovelId('诡秘之主（测试样本）.txt'), '诡秘之主_测试样本__txt');
  assert.equal(toNovelId('a b.txt'), 'a_b_txt');
});

test('isAnalysisCacheKey - matches only the chapter caches of that exact novel', () => {
  assert.equal(isAnalysisCacheKey('novel_analysis_a_txt_0', 'a_txt'), true);
  assert.equal(isAnalysisCacheKey('novel_analysis_a_txt_12', 'a_txt'), true);
});

test('isAnalysisCacheKey - never matches another novel whose id merely starts the same', () => {
  assert.equal(isAnalysisCacheKey('novel_analysis_a_txt2_txt_3', 'a_txt'), false);
  assert.equal(isAnalysisCacheKey('novel_analysis_a_txt_b_txt_3', 'a_txt'), false);
  assert.equal(isAnalysisCacheKey('novel_meta_a_txt', 'a_txt'), false);
});

// 与 Storage 相同的 length / key / removeItem 接口
function fakeStorage(keys: string[]) {
  const items = [...keys];
  return {
    get length() { return items.length; },
    key: (i: number) => items[i] ?? null,
    removeItem: (key: string) => {
      const at = items.indexOf(key);
      if (at >= 0) items.splice(at, 1);
    },
    keys: () => [...items],
  };
}

test('clearAnalysisCaches - removes every chapter cache of that novel, even adjacent ones', () => {
  const storage = fakeStorage(['novel_analysis_a_txt_0', 'novel_analysis_a_txt_1', 'novel_analysis_a_txt_2']);
  clearAnalysisCaches(storage, 'a_txt');
  assert.deepEqual(storage.keys(), []);
});

test('clearAnalysisCaches - keeps the novel text, the bookshelf and other novels', () => {
  const kept = ['novel_meta_a_txt', 'novel_bookshelf_index', 'novel_analysis_a_txt2_txt_3', 'novel_craft_project'];
  const storage = fakeStorage(['novel_analysis_a_txt_5', ...kept]);
  clearAnalysisCaches(storage, 'a_txt');
  assert.deepEqual(storage.keys(), kept);
});
