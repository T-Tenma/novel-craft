import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkeletonFromAnalyses } from './skeleton.ts';
import type { ChapterAnalysis, CharacterItem, WorldElement } from '../types';

const analysis = (id: number, summary: string, hook = ''): ChapterAnalysis => ({
  chapter_id: id,
  chapter_title: `第${id}章 标题${id}`,
  summary,
  tension_score: 8,
  narrative_hook: hook,
  characters: [],
  world_elements: [],
  technique_notes: '',
});

const CHARACTERS: CharacterItem[] = [{ name: '克莱恩', status: '已有角色', role: '主角 / 占卜家', key_action: '', inner_motivation: '找到回家的路' }];
const WORLD: WorldElement[] = [{ term: '非凡途径', category: '力量体系', description: '服用魔药晋升，失控即疯' }];

test('buildSkeletonFromAnalyses - chapter beats in order with their hooks, then characters and settings', () => {
  const analyses = { 2: analysis(2, '加入值夜者', '队长递来魔药'), 1: analysis(1, '死而复生', '窗外绯红满月') };
  const out = buildSkeletonFromAnalyses({ fileName: '诡秘之主.txt', analyses, characters: CHARACTERS, worldElements: WORLD });
  assert.match(out, /^参考《诡秘之主》的结构（已拆解 2 章）/);
  assert.match(out, /第1章 标题1：死而复生（章末钩子：窗外绯红满月）\n第2章 标题2：加入值夜者（章末钩子：队长递来魔药）/);
  assert.match(out, /【主要人物】[\s\S]*克莱恩（主角 \/ 占卜家）：找到回家的路/);
  assert.match(out, /【核心设定】[\s\S]*非凡途径（力量体系）：服用魔药晋升/);
});

test('buildSkeletonFromAnalyses - nothing analyzed, nothing to migrate', () => {
  assert.equal(buildSkeletonFromAnalyses({ fileName: 'a.txt', analyses: {}, characters: CHARACTERS, worldElements: WORLD }), '');
});

test('buildSkeletonFromAnalyses - long books keep the opening and the latest chapters, long texts are clipped', () => {
  const analyses = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, analysis(i + 1, `事件${i + 1}` + '长'.repeat(200))]));
  const many = Array.from({ length: 20 }, (_, i) => ({ ...CHARACTERS[0], name: `角色${i}` }));
  const out = buildSkeletonFromAnalyses({ fileName: 'a.txt', analyses, characters: many, worldElements: [] });
  assert.match(out, /第1章 标题1：事件1/);
  assert.match(out, /第16章 标题16：事件16/);
  assert.match(out, /中间省略 16 章/);
  assert.ok(!out.includes('第17章') && !out.includes('第24章'));
  assert.match(out, /第40章 标题40：事件40/);
  assert.ok(!out.includes('长'.repeat(100)));
  assert.ok(out.includes('角色7') && !out.includes('角色8'));
  assert.doesNotMatch(out, /核心设定/);
});
