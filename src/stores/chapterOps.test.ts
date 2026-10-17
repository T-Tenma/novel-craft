import test from 'node:test';
import assert from 'node:assert/strict';
import { removeChapter, resolveActiveDraft, composeChapterText, setChapterContent, findChapter, locateChapter, restoreChapterAt, resolveReferenceChapterId, setChapterReference, removeVolume, restoreVolumeAt, updateVolumeInfo, chapterTitleOrDefault } from './chapterOps.ts';

test('resolveReferenceChapterId - a chapter bound to a source chapter keeps that reference', () => {
  assert.equal(resolveReferenceChapterId(2, 5, [0, 1, 2, 5]), 2);
});

test('resolveReferenceChapterId - id 0 (the intro chapter) is a valid reference, not "nothing selected"', () => {
  assert.equal(resolveReferenceChapterId(0, 3, [0, 1, 3]), 0);
  assert.equal(resolveReferenceChapterId(undefined, 0, [0, 1]), 0);
});

test('resolveReferenceChapterId - unbound or stale bindings follow the deconstruct selection', () => {
  assert.equal(resolveReferenceChapterId(undefined, 3, [1, 3]), 3);
  assert.equal(resolveReferenceChapterId(42, 3, [1, 3]), 3, 'binding to a chapter missing from the current novel');
  assert.equal(resolveReferenceChapterId(undefined, null, [1]), null);
  assert.equal(resolveReferenceChapterId(1, 1, []), null, 'no novel loaded');
});

test('setChapterReference - binds and unbinds without touching other chapters', () => {
  const bound = setChapterReference(VOLUMES, 'b', 0);
  assert.equal(findChapter(bound, 'b')?.reference_chapter_id, 0);
  assert.equal(findChapter(bound, 'a')?.reference_chapter_id, undefined);
  const unbound = setChapterReference(bound, 'b', undefined);
  assert.equal('reference_chapter_id' in findChapter(unbound, 'b')!, false);
});

test('locateChapter / restoreChapterAt - a deleted chapter goes back to the same volume and position', () => {
  const location = locateChapter(VOLUMES, 'b');
  assert.deepEqual(location, { volumeId: 'v1', index: 1 });
  const deleted = findChapter(VOLUMES, 'b')!;
  const afterDelete = removeChapter(VOLUMES, 'b', 'a').volumes;
  const restored = restoreChapterAt(afterDelete, location!.volumeId, location!.index, deleted);
  assert.deepEqual(restored?.[0].chapters.map((c) => c.id), ['a', 'b']);
});

test('restoreChapterAt - returns null when the volume no longer exists', () => {
  assert.equal(restoreChapterAt(VOLUMES, 'gone', 0, findChapter(VOLUMES, 'a')!), null);
  assert.equal(locateChapter(VOLUMES, 'nope'), null);
});
import type { StoryVolume } from '../types';

const chapter = (id: string, content: string) => ({
  id,
  title: `title-${id}`,
  content,
  word_count: content.length,
  status: 'draft' as const,
});

const VOLUMES: StoryVolume[] = [
  { id: 'v1', title: 'V1', description: '', chapters: [chapter('a', 'AAA'), chapter('b', 'BBB')] },
  { id: 'v2', title: 'V2', description: '', chapters: [chapter('c', 'CCC')] },
];

test('removeChapter - deleting a non-active chapter keeps the active chapter and its draft', () => {
  const next = removeChapter(VOLUMES, 'a', 'b');
  assert.equal(next.activeChapterId, 'b');
  assert.equal(next.draftContent, 'BBB');
  assert.equal(next.draftTitle, 'title-b');
  assert.deepEqual(next.volumes[0].chapters.map((c) => c.id), ['b']);
});

test('removeChapter - deleting the active chapter moves to the first remaining one with its own draft', () => {
  const next = removeChapter(VOLUMES, 'b', 'b');
  assert.equal(next.activeChapterId, 'a');
  assert.equal(next.draftContent, 'AAA', 'draft must not keep the deleted chapter text');
  assert.equal(next.draftTitle, 'title-a');
});

test('removeChapter - deleting the last chapter clears the draft', () => {
  const single: StoryVolume[] = [{ id: 'v', title: 'V', description: '', chapters: [chapter('x', 'XXX')] }];
  const next = removeChapter(single, 'x', 'x');
  assert.equal(next.activeChapterId, '');
  assert.equal(next.draftContent, '');
  assert.equal(next.draftTitle, '');
});

test('resolveActiveDraft - derives the draft from the active chapter', () => {
  assert.deepEqual(resolveActiveDraft(VOLUMES, 'c'), { activeChapterId: 'c', draftTitle: 'title-c', draftContent: 'CCC' });
});

test('resolveActiveDraft - falls back to the first chapter when the active id no longer exists', () => {
  assert.deepEqual(resolveActiveDraft(VOLUMES, 'gone'), { activeChapterId: 'a', draftTitle: 'title-a', draftContent: 'AAA' });
  assert.deepEqual(resolveActiveDraft([], 'gone'), { activeChapterId: '', draftTitle: '', draftContent: '' });
});

test('composeChapterText - append adds a blank line between existing text and the AI text', () => {
  assert.equal(composeChapterText('第一段。\n\n', '  第二段。 ', 'append'), '第一段。\n\n第二段。');
  assert.equal(composeChapterText('   ', '第一段。', 'append'), '第一段。', 'no leading blank lines on an empty chapter');
});

test('composeChapterText - replace swaps the whole text', () => {
  assert.equal(composeChapterText('旧正文', '\n新正文\n', 'replace'), '新正文');
});

test('setChapterContent - writes only the target chapter and recounts words', () => {
  const next = setChapterContent(VOLUMES, 'c', '新 内容\n很长');
  assert.equal(findChapter(next, 'c')?.content, '新 内容\n很长');
  assert.equal(findChapter(next, 'c')?.word_count, 5);
  assert.equal(findChapter(next, 'a')?.content, 'AAA');
  assert.equal(findChapter(VOLUMES, 'c')?.content, 'CCC', 'input must not be mutated');
});

test('setChapterContent / findChapter - unknown chapter id changes nothing', () => {
  const next = setChapterContent(VOLUMES, 'gone', 'x');
  assert.deepEqual(next, VOLUMES);
  assert.equal(findChapter(VOLUMES, 'gone'), undefined);
});

test('removeChapter - does not mutate the input', () => {
  const snapshot = JSON.stringify(VOLUMES);
  removeChapter(VOLUMES, 'a', 'a');
  assert.equal(JSON.stringify(VOLUMES), snapshot);
});

test('removeVolume - deleting the volume that holds the active chapter moves the draft to the first remaining chapter', () => {
  const next = removeVolume(VOLUMES, 'v1', 'b');
  assert.deepEqual(next.volumes.map((v) => v.id), ['v2']);
  assert.equal(next.activeChapterId, 'c');
  assert.equal(next.draftContent, 'CCC', 'draft must not keep text from the deleted volume');
});

test('removeVolume - deleting another volume keeps the active chapter, deleting the only one clears the draft', () => {
  assert.equal(removeVolume(VOLUMES, 'v2', 'b').activeChapterId, 'b');
  const empty = removeVolume([VOLUMES[0]], 'v1', 'a');
  assert.deepEqual(empty.volumes, []);
  assert.equal(empty.activeChapterId, '');
  assert.equal(empty.draftContent, '');
});

test('restoreVolumeAt - an undone volume delete goes back to its position with all chapters', () => {
  const removed = removeVolume(VOLUMES, 'v1', 'a').volumes;
  const restored = restoreVolumeAt(removed, 0, VOLUMES[0]);
  assert.deepEqual(restored.map((v) => v.id), ['v1', 'v2']);
  assert.deepEqual(restored[0].chapters.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(restoreVolumeAt(VOLUMES, 0, VOLUMES[0]), VOLUMES, 'restoring twice must not duplicate the volume');
});

test('updateVolumeInfo - renames one volume and leaves the others and the chapters untouched', () => {
  const next = updateVolumeInfo(VOLUMES, 'v2', '第二卷', '主线');
  assert.equal(next[1].title, '第二卷');
  assert.equal(next[1].description, '主线');
  assert.equal(next[1].chapters, VOLUMES[1].chapters);
  assert.equal(next[0], VOLUMES[0]);
});

test('chapterTitleOrDefault - a cleared title still shows something in lists and exports', () => {
  assert.equal(chapterTitleOrDefault('第三章 夜雨'), '第三章 夜雨');
  assert.equal(chapterTitleOrDefault('  '), '未命名章节');
  assert.equal(chapterTitleOrDefault(''), '未命名章节');
});
