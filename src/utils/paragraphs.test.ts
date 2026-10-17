import test from 'node:test';
import assert from 'node:assert/strict';
import { splitParagraphs, buildNumberedChapterText, assignParagraphAnalyses, upsertParagraphAnalysis } from './paragraphs.ts';

test('upsertParagraphAnalysis - replaces the analysis with the same index, appends otherwise', () => {
  const list = [{ index: 1, note: 'a' }, { index: 3, note: 'b' }];
  assert.deepEqual(upsertParagraphAnalysis(list, { index: 3, note: 'new' }), [{ index: 1, note: 'a' }, { index: 3, note: 'new' }]);
  assert.deepEqual(upsertParagraphAnalysis(list, { index: 2, note: 'c' }).map((p) => p.index), [1, 3, 2]);
  assert.deepEqual(upsertParagraphAnalysis(undefined, { index: 5, note: 'x' }), [{ index: 5, note: 'x' }]);
});

test('upsertParagraphAnalysis - does not mutate the original list', () => {
  const list = [{ index: 1, note: 'a' }];
  upsertParagraphAnalysis(list, { index: 1, note: 'b' });
  assert.deepEqual(list, [{ index: 1, note: 'a' }]);
});

test('splitParagraphs - trims lines and drops blanks (CRLF too)', () => {
  assert.deepEqual(splitParagraphs('第一章 绯红\r\n\r\n  痛！好痛！ \n\n\n头部剧痛。'), [
    '第一章 绯红',
    '痛！好痛！',
    '头部剧痛。',
  ]);
});

test('buildNumberedChapterText - numbers every paragraph when under budget', () => {
  const text = buildNumberedChapterText(['第一章 绯红', '痛！好痛！'], 1000);
  assert.equal(text, '[1] 第一章 绯红\n[2] 痛！好痛！');
});

test('buildNumberedChapterText - keeps head and tail with original numbering when over budget', () => {
  const paragraphs = Array.from({ length: 50 }, (_, i) => `段落${i + 1}`.padEnd(40, '文'));
  const text = buildNumberedChapterText(paragraphs, 600);
  const lines = text.split('\n');

  assert.ok(lines[0].startsWith('[1] 段落1'));
  assert.ok(lines[lines.length - 1].startsWith('[50] 段落50'), 'chapter ending (hook) must be kept');
  const marker = lines.find((l) => l.includes('中间省略'));
  assert.ok(marker, 'omission marker should be present');
  assert.ok(text.length <= 600 + marker!.length + 1);
});

test('buildNumberedChapterText - truncates a single oversized paragraph instead of dropping it', () => {
  const text = buildNumberedChapterText(['长'.repeat(5000)], 300);
  assert.ok(text.startsWith('[1] 长'));
  assert.ok(text.includes('已截断'));
  assert.ok(text.length < 400);
});

const PARAGRAPHS = ['第一章 绯红', '痛！好痛！', '头部像是被一柄锈蚀的钝刀狠狠搅碎', '身下是维多利亚时代的破旧书桌'];

test('assignParagraphAnalyses - assigns by index when excerpts are absent', () => {
  const map = assignParagraphAnalyses(PARAGRAPHS, [{ index: 3, paragraph_excerpt: '' }]);
  assert.equal(map.get(2)?.index, 3);
  assert.equal(map.size, 1);
});

test('assignParagraphAnalyses - excerpt match wins over an off-by-one index', () => {
  const analyses = [
    { index: 1, paragraph_excerpt: '痛！好痛！' },
    { index: 2, paragraph_excerpt: '头部像是被一柄锈蚀的钝刀...' },
  ];
  const map = assignParagraphAnalyses(PARAGRAPHS, analyses);
  assert.equal(map.get(0), undefined, 'title line must not inherit paragraph 2 commentary');
  assert.equal(map.get(1), analyses[0]);
  assert.equal(map.get(2), analyses[1]);
});

test('assignParagraphAnalyses - paragraphs without analysis get nothing (no fallback to the first one)', () => {
  const map = assignParagraphAnalyses(PARAGRAPHS, [{ index: 2, paragraph_excerpt: '痛！好痛！' }]);
  assert.equal(map.get(3), undefined);
});

test('assignParagraphAnalyses - tolerates malformed LLM items', () => {
  const malformed = [{ index: 2, paragraph_excerpt: null }, { index: 'x', paragraph_excerpt: 42 }, null] as unknown[];
  assert.doesNotThrow(() => assignParagraphAnalyses(PARAGRAPHS, malformed as any));
  assert.equal(assignParagraphAnalyses(PARAGRAPHS, malformed as any).get(1)?.index, 2);
  assert.equal(assignParagraphAnalyses(PARAGRAPHS, undefined).size, 0);
});

test('assignParagraphAnalyses - a matching index wins when several paragraphs share the same opening', () => {
  const repeated = ['他冷笑一声，没有回答任何问题。甲', '他冷笑一声，没有回答任何问题。乙'];
  const analysis = { index: 2, paragraph_excerpt: '他冷笑一声，没有回答任何问题...' };
  assert.equal(assignParagraphAnalyses(repeated, [analysis]).get(1), analysis);
});

test('buildNumberedChapterText - never duplicates a paragraph and keeps the chapter ending (property check)', () => {
  const lengths = [5, 30, 80, 150, 400];
  for (const maxChars of [150, 300, 600]) {
    for (let count = 1; count <= 6; count++) {
      for (const len of lengths) {
        const paragraphs = Array.from({ length: count }, (_, i) =>
          `${i}`.repeat(1) + '字'.repeat(len + ((i * 37) % 90)) + `尾${i}`,
        );
        const text = buildNumberedChapterText(paragraphs, maxChars);
        const lines = text.split('\n');
        const label = `max=${maxChars} count=${count} len=${len}`;

        const numbers = lines.map((l) => /^\[(\d+)\]/.exec(l)?.[1]).filter(Boolean);
        for (const n of new Set(numbers)) {
          const same = lines.filter((l) => l.startsWith(`[${n}] `));
          assert.ok(same.length <= 2, `${label}: [${n}] appears ${same.length} times`);
          if (same.length === 2) {
            assert.ok(same[0].endsWith('已截断）') && same[1].includes('前文已截断'), `${label}: [${n}] duplicated without being split`);
          }
        }
        assert.ok(text.endsWith(`尾${count - 1}`), `${label}: chapter ending must be kept`);

        const markerAt = lines.findIndex((l) => l.includes('中间省略'));
        if (markerAt >= 0) {
          const before = Number(/^\[(\d+)\]/.exec(lines[markerAt - 1] ?? '')?.[1] ?? 0);
          const after = Number(/^\[(\d+)\]/.exec(lines[markerAt + 1] ?? '')?.[1] ?? count + 1);
          assert.ok(after - before > 1, `${label}: marker without any omitted paragraph`);
        }
      }
    }
  }
});

test('assignParagraphAnalyses - one paragraph is never claimed twice', () => {
  const analyses = [
    { index: 2, paragraph_excerpt: '痛！好痛！' },
    { index: 2, paragraph_excerpt: '' },
  ];
  const map = assignParagraphAnalyses(PARAGRAPHS, analyses);
  assert.equal(map.get(1), analyses[0]);
  assert.equal([...map.values()].filter((a) => a === analyses[1]).length, 0);
});
