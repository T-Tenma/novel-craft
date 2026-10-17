import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptRewrite, shouldRequestCritique } from './critique.ts';

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
