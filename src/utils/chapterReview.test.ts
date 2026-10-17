import test from 'node:test';
import assert from 'node:assert/strict';
import { getChapterReview } from './chapterReview.ts';
import type { ChapterReview } from './chapterReview.ts';

const report = {
  score_overall: 72,
  radar: { hook_strength: 70, pacing_tension: 70, character_arc: 70, curiosity_gap: 70, trope_freshness: 70 },
  pros: ['p'],
  cons: ['c'],
  revision_suggestions: ['r'],
};
const reviews: Record<string, ChapterReview> = { 'chap-1': { report, reviewedContent: '第一章正文' } };

test('getChapterReview - another chapter never shows the report of the chapter that was reviewed', () => {
  assert.equal(getChapterReview(reviews, 'chap-2', '第二章正文'), null);
  assert.equal(getChapterReview(reviews, '', ''), null);
});

test('getChapterReview - returns the chapter own report while its text is unchanged', () => {
  assert.deepEqual(getChapterReview(reviews, 'chap-1', '第一章正文'), { report, isStale: false });
});

test('getChapterReview - marks the report stale once the chapter text was edited after the review', () => {
  assert.deepEqual(getChapterReview(reviews, 'chap-1', '第一章正文，又补了一段'), { report, isStale: true });
});
