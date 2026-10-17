import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptRewrite, adoptAllRewrites, pendingRewrites, shouldRequestCritique, nextCritiqueStart, CRITIQUE_BATCH_SIZE } from './critique.ts';

const draft = '第一段，主角醒来。\n\n第二段，窗外下着雨，他想起了很多事。\n\n第三段，敲门声响起。';

test('adoptRewrite - replaces the paragraph the critique points at', () => {
  const result = adoptRewrite(draft, '第二段，窗外下着雨，他想起了很多事。', '雨砸在窗上。');
  assert.equal(result.appended, false);
  assert.equal(result.content, '第一段，主角醒来。\n\n雨砸在窗上。\n\n第三段，敲门声响起。');
});

test('adoptRewrite - original paragraph no longer in the text: append and report it', () => {
  const result = adoptRewrite(draft, '已经被作者改掉的那一段原文', '改写示范。');
  assert.equal(result.appended, true);
  assert.equal(result.content, `${draft}\n\n改写示范。`);
});

test('adoptRewrite - an empty quote never overwrites the first paragraph', () => {
  const result = adoptRewrite(draft, '  ', '改写示范。');
  assert.equal(result.appended, true);
  assert.ok(result.content.startsWith('第一段，主角醒来。'));
});

test('shouldRequestCritique - no critique for this chapter yet: request one', () => {
  assert.equal(shouldRequestCritique(false, false), true);
});

test('shouldRequestCritique - critique exists but the drawer was closed: just reopen it', () => {
  assert.equal(shouldRequestCritique(true, false), false);
});

test('shouldRequestCritique - drawer already showing the critique: run a fresh one', () => {
  assert.equal(shouldRequestCritique(true, true), true);
});

test('nextCritiqueStart - continues after the last critiqued paragraph until the chapter is covered', () => {
  assert.equal(CRITIQUE_BATCH_SIZE, 10);
  assert.equal(nextCritiqueStart(40, []), 0);
  assert.equal(nextCritiqueStart(40, [{ index: 1 }, { index: 2 }, { index: 10 }]), 10);
  assert.equal(nextCritiqueStart(40, [{ index: 3 }, { index: 20 }, { index: 7 }]), 20, 'skipped paragraphs inside a batch are not re-requested');
  assert.equal(nextCritiqueStart(12, [{ index: 12 }]), null, 'whole chapter covered');
  assert.equal(nextCritiqueStart(8, [{ index: 9 }]), null, 'chapter got shorter after adopting');
});

const item = (index: number, paragraph_text: string, rewrite_suggestion?: string) => ({
  index,
  paragraph_text,
  grade: '硬伤·拖沓灌水' as const,
  editor_comment: '点评',
  ...(rewrite_suggestion === undefined ? {} : { rewrite_suggestion }),
});

test('pendingRewrites - only critiques with a rewrite that has not been adopted yet', () => {
  const list = [item(1, 'a', '改1'), item(2, 'b'), item(3, 'c', '改3'), item(4, 'd', '改4')];
  assert.deepEqual(pendingRewrites(list, [3]).map((c) => c.index), [1, 4]);
});

test('adoptAllRewrites - replaces every pending paragraph in one pass', () => {
  const result = adoptAllRewrites(draft, [
    item(1, '第一段，主角醒来。', '他睁开眼。'),
    item(3, '第三段，敲门声响起。', '门被敲响了。'),
  ]);
  assert.equal(result.content, '他睁开眼。\n\n第二段，窗外下着雨，他想起了很多事。\n\n门被敲响了。');
  assert.deepEqual(result.adopted, [1, 3]);
  assert.deepEqual(result.missing, []);
});

test('adoptAllRewrites - a quote that is no longer in the text is skipped, not appended', () => {
  const result = adoptAllRewrites(draft, [
    item(1, '第一段，主角醒来。', '他睁开眼。'),
    item(2, '已经被作者改掉的那一段原文', '改写二。'),
    item(3, '  ', '改写三。'),
  ]);
  assert.equal(result.content, '他睁开眼。\n\n第二段，窗外下着雨，他想起了很多事。\n\n第三段，敲门声响起。');
  assert.deepEqual(result.adopted, [1]);
  assert.deepEqual(result.missing, [2, 3]);
});

test('adoptAllRewrites - paragraphs are located before replacing, so a rewrite never becomes a later target', () => {
  // 第 1 段的改写里含有第 3 段的开头；逐条替换会把第 3 条改写错放到第 1 段
  const result = adoptAllRewrites(draft, [
    item(1, '第一段，主角醒来。', '第三段，敲门声响起。他醒了。'),
    item(3, '第三段，敲门声响起。', '门被敲响了。'),
  ]);
  assert.equal(result.content, '第三段，敲门声响起。他醒了。\n\n第二段，窗外下着雨，他想起了很多事。\n\n门被敲响了。');
});

test('adoptAllRewrites - two critiques with the same opening go to different paragraphs', () => {
  const text = '他抬起头，看着远处那片灯火通明的街市。\n\n中间一段。\n\n他抬起头，看着远处那片灯火通明的街市渐渐熄灭。';
  const result = adoptAllRewrites(text, [
    item(1, '他抬起头，看着远处那片灯火通明的街市。', '灯火在远处。'),
    item(3, '他抬起头，看着远处那片灯火通明的街市渐渐熄灭。', '灯火灭了。'),
  ]);
  assert.equal(result.content, '灯火在远处。\n\n中间一段。\n\n灯火灭了。');
  assert.deepEqual(result.adopted, [1, 3]);
});

const repeated = '他抬起头，看着远处那片灯火通明的街市。\n\n中间一段。\n\n他抬起头，看着远处那片灯火通明的街市渐渐熄灭。';

test('adoptRewrite - repeated openings: the paragraph at the critique number wins', () => {
  const result = adoptRewrite(repeated, '他抬起头，看着远处那片灯火通明的街市渐渐熄灭。', '灯火灭了。', 3);
  assert.equal(result.content, '他抬起头，看着远处那片灯火通明的街市。\n\n中间一段。\n\n灯火灭了。');
});

test('adoptAllRewrites - repeated openings: an uncritiqued earlier paragraph is not taken', () => {
  const result = adoptAllRewrites(repeated, [item(3, '他抬起头，看着远处那片灯火通明的街市渐渐熄灭。', '灯火灭了。')]);
  assert.equal(result.content, '他抬起头，看着远处那片灯火通明的街市。\n\n中间一段。\n\n灯火灭了。');
});

test('adoptAllRewrites - blank lines do not shift the numbering; a stale number falls back to the quote', () => {
  const text = '第一段。\n  \n第二段，雨还在下。\n\n第三段，门开了。';
  assert.equal(adoptAllRewrites(text, [item(2, '第二段，雨还在下。', '雨停了。')]).content, '第一段。\n\n  \n\n雨停了。\n\n第三段，门开了。');
  // 段号对不上（前面的段落被拆开或合并过）时按原文开头找
  assert.equal(adoptAllRewrites(text, [item(1, '第三段，门开了。', '门开了。')]).content, '第一段。\n\n  \n\n第二段，雨还在下。\n\n门开了。');
});
