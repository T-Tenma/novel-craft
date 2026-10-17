import test from 'node:test';
import assert from 'node:assert/strict';
import { hashText, summaryStatus, chaptersNeedingSummary } from './chapterSummary.ts';
import type { StoryChapter } from '../types';

const chapter = (id: string, content: string, summary?: string): StoryChapter => ({
  id,
  title: id,
  content,
  word_count: content.length,
  status: 'draft',
  ...(summary === undefined ? {} : { summary: { text: summary, state_changes: [], content_hash: hashText(content) } }),
});

test('hashText - the same text hashes the same, any edit changes it', () => {
  assert.equal(hashText('陈逢青推开门。'), hashText('陈逢青推开门。'));
  assert.notEqual(hashText('陈逢青推开门。'), hashText('陈逢青推开了门。'));
  assert.notEqual(hashText(''), hashText(' '));
  assert.match(hashText('x'), /^[0-9a-f]{8}$/);
});

test('summaryStatus - none, fresh, or stale once the text changed after summarizing', () => {
  assert.equal(summaryStatus(chapter('a', '正文')), 'none');
  const fresh = chapter('a', '正文', '摘要');
  assert.equal(summaryStatus(fresh), 'fresh');
  assert.equal(summaryStatus({ ...fresh, content: '正文改了' }), 'stale');
});

test('chaptersNeedingSummary - written chapters without a fresh summary, empty chapters skipped', () => {
  const list = [chapter('a', '甲', '摘要'), chapter('b', '乙'), chapter('c', ''), { ...chapter('d', '丁', '摘要'), content: '丁改' }];
  assert.deepEqual(chaptersNeedingSummary(list).map((c) => c.id), ['b', 'd']);
});
