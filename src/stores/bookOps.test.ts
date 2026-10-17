import test from 'node:test';
import assert from 'node:assert/strict';
import { dropUntouchedDemoVolumes, dropUntouchedDemoCards, inferBookStarts, dropPlaceholderIdeas } from './bookOps.ts';
import { DEMO_VOLUMES, DEMO_CHARACTERS, DEMO_WORLD_ELEMENTS } from './demoSeed.ts';
import type { BrainwaveIdea, StoryVolume } from '../types';

const volume = (id: string, title: string, description = '', content = ''): StoryVolume => ({
  id,
  title,
  description,
  chapters: [{ id: `${id}-c1`, title: '第一章', content, word_count: content.length, status: 'draft' }],
});

test('dropUntouchedDemoVolumes - removes the demo volumes exactly as seeded, keeps everything else', () => {
  const mine = volume('vol-9', '我的卷', '', '我的正文');
  assert.deepEqual(dropUntouchedDemoVolumes([DEMO_VOLUMES[0], DEMO_VOLUMES[1], mine]), [mine]);
});

test('dropUntouchedDemoVolumes - any change the author made to a demo volume keeps it', () => {
  const [seed] = DEMO_VOLUMES;
  const variants: StoryVolume[] = [
    { ...seed, chapters: [...seed.chapters, { id: 'added', title: '我加的章', content: '', word_count: 0, status: 'draft' }] },
    { ...seed, chapters: seed.chapters.map((c, i) => (i === 0 ? { ...c, title: '改过的章名' } : c)) },
    { ...seed, title: '我的第一卷' },
    { ...seed, description: '我改的主线' },
    { ...seed, chapters: [] },
    { ...seed, chapters: seed.chapters.map((c, i) => (i === 1 ? { ...c, outline: '我写的细纲' } : c)) },
  ];
  for (const v of variants) assert.deepEqual(dropUntouchedDemoVolumes([v]), [v]);
});

test('dropUntouchedDemoVolumes - a demo volume the author wrote in is the author\'s now', () => {
  const edited: StoryVolume = {
    ...DEMO_VOLUMES[0],
    chapters: DEMO_VOLUMES[0].chapters.map((c, i) => (i === 1 ? { ...c, content: '我续写的内容' } : c)),
  };
  assert.deepEqual(dropUntouchedDemoVolumes([edited, DEMO_VOLUMES[1]]), [edited]);
});

const IDEAS = [{ id: 'i1', title: '灭门后，我把残宗伪装成隐世禁地' }] as BrainwaveIdea[];

test('inferBookStarts - marks volumes made by adopting an outline or starting an imitation practice', () => {
  const volumes = [
    volume('a', '全一卷 · 梅雨纸人', '扎彩客的故事'),
    volume('b', '第二卷', '续写'),
    volume('c', '改了名的卷', '【金手指】逆死簿\n【核心冲突】……'),
    volume('d', '《仿诡秘之主节奏》第一卷', '参考《诡秘之主》黄金开篇的仿写练习'),
    volume('e', '《灭门后，我把残宗伪装成隐世禁地》第一卷', '作者改写过的简介'),
  ];
  const marked = inferBookStarts(volumes, IDEAS);
  assert.deepEqual(marked.map((v) => !!v.starts_new_book), [false, false, true, true, true]);
  assert.equal(volumes[2].starts_new_book, undefined, 'input is not mutated');
  assert.deepEqual(inferBookStarts(marked, IDEAS), marked, 'running it again changes nothing');
});

test('dropPlaceholderIdeas - removes the boilerplate cards old versions added and clears a selection pointing at one', () => {
  const ideas = [{ id: 'idea-migrated-1700000000000', title: '基于《x》结构的新书构想' }, { id: 'i1', title: '真脑洞' }] as BrainwaveIdea[];
  assert.deepEqual(dropPlaceholderIdeas(ideas, 'idea-migrated-1700000000000'), { ideas: [ideas[1]], selectedIdeaId: null });
  assert.deepEqual(dropPlaceholderIdeas(ideas, 'i1'), { ideas: [ideas[1]], selectedIdeaId: 'i1' });
});

test('dropUntouchedDemoCards - removes the demo character and setting cards nobody edited', () => {
  const edited = { ...DEMO_CHARACTERS[0], inner_motivation: '我改过的动机' };
  const mine = { name: '沈淮', status: '新登场' as const, role: '男主', key_action: '', inner_motivation: '' };
  const myRule = { term: '逆死簿', category: '力量体系' as const, description: '每借一息扣寿三年' };
  assert.deepEqual(dropUntouchedDemoCards([edited, DEMO_CHARACTERS[1], mine], [...DEMO_WORLD_ELEMENTS, myRule]), {
    characters: [edited, mine],
    worldElements: [myRule],
  });
});
