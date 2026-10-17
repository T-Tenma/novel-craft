import test from 'node:test';
import assert from 'node:assert/strict';
import { planScope, buildPlanContext, describeIdea } from './chapterPlan.ts';
import { hashText } from './chapterSummary.ts';
import type { BrainwaveIdea, StoryChapter, StoryVolume } from '../types';

const chapter = (id: string, content: string, outline?: string): StoryChapter => ({
  id,
  title: `章${id}`,
  content,
  word_count: content.length,
  status: 'draft',
  ...(outline ? { outline } : {}),
});

const VOLUMES: StoryVolume[] = [
  { id: 'old', title: '上一本书', description: '', chapters: [chapter('o1', '旧书正文')] },
  { id: 'v1', title: '第一卷', description: '', starts_new_book: true, chapters: [chapter('a', '甲'), chapter('b', '乙')] },
  { id: 'v2', title: '第二卷', description: '', chapters: [chapter('c', '丙'), chapter('d', '', '原定细纲'), chapter('e', '')] },
];

test('planScope - unwritten chapters after the last written one are the slots; numbering continues the book', () => {
  const scope = planScope(VOLUMES, 'v2');
  assert.deepEqual(scope.earlier.map((c) => c.id), ['a', 'b', 'c'], 'the previous book is not part of the story so far');
  assert.deepEqual(scope.slots.map((c) => c.id), ['d', 'e']);
  assert.equal(scope.startNumber, 4);
});

test('planScope - an empty chapter between written ones stays where it is', () => {
  const volumes: StoryVolume[] = [{ id: 'v', title: '卷', description: '', chapters: [chapter('x', '一'), chapter('y', ''), chapter('z', '三'), chapter('w', '')] }];
  const scope = planScope(volumes, 'v');
  assert.deepEqual(scope.slots.map((c) => c.id), ['w']);
  assert.deepEqual(scope.earlier.map((c) => c.id), ['x', 'y', 'z']);
  assert.equal(scope.startNumber, 4);
});

test('planScope - an empty volume starts after the earlier volumes of the same book', () => {
  const volumes: StoryVolume[] = [...VOLUMES, { id: 'v3', title: '第三卷', description: '', chapters: [] }];
  const scope = planScope(volumes, 'v3');
  assert.deepEqual(scope.slots, []);
  assert.deepEqual(scope.earlier.map((c) => c.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(scope.startNumber, 6);
});

test('buildPlanContext - settings, the recap of the story so far and where the latest chapter ends', () => {
  const written = { ...chapter('c', '前文' + '字'.repeat(2000) + '城门落锁。'), summary: { text: '陈逢青进城。', state_changes: [], content_hash: hashText('x') } };
  const scope = { earlier: [chapter('a', '甲'), written], slots: [], startNumber: 3 };
  const ctx = buildPlanContext(scope, [{ name: '陈逢青', status: '已有角色', role: '男主', key_action: '', inner_motivation: '' }], []);
  assert.match(ctx, /【人物设定】\n- 陈逢青（男主）/);
  assert.match(ctx, /【前情提要】[^\n]*\n- 章a\n- 章c：陈逢青进城。/);
  assert.match(ctx, /【最新一章《章c》结尾】\n字+城门落锁。$/);
  assert.ok(!ctx.includes('前文'), 'only the end of the latest chapter, not the whole text');
  assert.equal(buildPlanContext({ earlier: [], slots: [], startNumber: 1 }, [], []), '');
});

test('describeIdea - the selected idea as the book outline; nothing when none is selected', () => {
  const idea: BrainwaveIdea = {
    id: 'i',
    title: '扎彩客',
    genre: '民国志怪',
    source_skeleton: '',
    golden_finger: '点睛',
    main_conflict: '换命局',
    three_act_beats: { act1: '寿宴', act2: '进城', act3: '破局' },
  };
  assert.equal(describeIdea(idea), '书名《扎彩客》，题材：民国志怪\n金手指：点睛\n核心冲突：换命局\n【起】寿宴\n【承】进城\n【转合】破局');
  assert.equal(describeIdea(null), '');
});

