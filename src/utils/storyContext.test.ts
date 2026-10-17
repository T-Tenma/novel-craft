import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryContext, buildPreviousChapterContext, excerptHeadTail } from './storyContext.ts';
import type { CharacterItem, StoryVolume, WorldElement } from '../types';

const chapter = (id: string, title: string, content: string) => ({ id, title, content, word_count: content.length, status: 'draft' as const });

const VOLUMES: StoryVolume[] = [
  {
    id: 'v1',
    title: '第一卷',
    description: '中元夜寿宴，主角当众揭穿沈家换命局。',
    chapters: [chapter('c1', '第一章 纸人点睛', '开头。'.repeat(10) + '门外的手指抠了进来。'), chapter('c2', '第二章 缝尸脱罪', '')],
  },
  { id: 'v2', title: '第二卷', description: '', chapters: [chapter('c3', '第三章 篾骨低语', '小玉叫了一声哥。')] },
];

const CHARACTERS: CharacterItem[] = [
  { name: '陈逢青', status: '已有角色', role: '男主 / 扎彩铺传人', key_action: '', inner_motivation: '七日内润色醒神' },
  { name: '沈管事', status: '退场/阵亡', role: '沈家管事', key_action: '', inner_motivation: '' },
];
const WORLD: WorldElement[] = [{ term: '《篾骨纸煞谱》', category: '力量体系', description: '每驱一次纸煞，皮肉脆化如宣' }];

test('excerptHeadTail - keeps short text and keeps both ends of long text', () => {
  assert.equal(excerptHeadTail('短文', 10), '短文');
  const long = '头'.repeat(50) + '中'.repeat(100) + '尾'.repeat(50);
  const out = excerptHeadTail(long, 100);
  assert.ok(out.startsWith('头'.repeat(50)), 'head kept');
  assert.ok(out.endsWith('尾'.repeat(40)), 'the ending (chapter hook) is kept');
  assert.match(out, /中间省略 100 字/);
  assert.ok(!out.includes('中'.repeat(20)));
});

test('buildPreviousChapterContext - gives the ending of the chapter just before, across volumes', () => {
  const ctx = buildPreviousChapterContext(VOLUMES, 'c2');
  assert.match(ctx, /第一章 纸人点睛/);
  assert.match(ctx, /门外的手指抠了进来。/);
  // 第三章的上一章（第二章）没有正文，再往前找到第一章
  assert.match(buildPreviousChapterContext(VOLUMES, 'c3'), /门外的手指抠了进来。/);
  assert.equal(buildPreviousChapterContext(VOLUMES, 'c1'), '', 'the first chapter has no previous chapter');
  assert.equal(buildPreviousChapterContext(VOLUMES, 'missing'), '');
});

test('buildPreviousChapterContext - long previous chapters keep only their ending', () => {
  const volumes = [{ ...VOLUMES[0], chapters: [chapter('a', '甲', '旧'.repeat(5000) + '结尾钩子'), chapter('b', '乙', '')] }];
  const ctx = buildPreviousChapterContext(volumes, 'b');
  assert.match(ctx, /结尾钩子$/);
  assert.ok(ctx.length < 1500);
});

test('buildStoryContext - combines outline, characters, settings, chapter list and the previous ending', () => {
  const ctx = buildStoryContext({ volumes: VOLUMES, chapterId: 'c2', characters: CHARACTERS, worldElements: WORLD });
  assert.match(ctx, /本卷大纲[\s\S]*中元夜寿宴/);
  assert.match(ctx, /陈逢青（男主 \/ 扎彩铺传人）：七日内润色醒神/);
  assert.match(ctx, /沈管事（沈家管事）【已退场\/阵亡】/, 'dead characters are marked so the model does not revive them');
  assert.match(ctx, /《篾骨纸煞谱》（力量体系）：每驱一次纸煞/);
  assert.match(ctx, /【已写章节】第一章 纸人点睛/);
  assert.match(ctx, /门外的手指抠了进来。/);
});

test('buildStoryContext - nothing to say for a lone first chapter without outline or settings', () => {
  const volumes = [{ ...VOLUMES[1], chapters: [chapter('x', '第一章', '')] }];
  assert.equal(buildStoryContext({ volumes, chapterId: 'x', characters: [], worldElements: [] }), '');
});

test('buildStoryContext - caps long outlines and long setting lists', () => {
  const volumes = [{ ...VOLUMES[0], description: '纲'.repeat(2000) }];
  const many = Array.from({ length: 30 }, (_, i) => ({ ...CHARACTERS[0], name: `角色${i}`, inner_motivation: '欲'.repeat(300) }));
  const ctx = buildStoryContext({ volumes, chapterId: 'c1', characters: many, worldElements: [] });
  assert.ok(!ctx.includes('纲'.repeat(700)));
  assert.ok(!ctx.includes('欲'.repeat(100)));
  assert.ok(ctx.includes('角色11') && !ctx.includes('角色12'));
});
