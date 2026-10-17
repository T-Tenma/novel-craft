// 「提炼模版」交给脑洞推演的剧情骨架：逐章事件与章末钩子才是骨架，再附主要人物与核心设定。
// 以前只取第一章钩子与平均张力，其余是固定套话，推演出来的脑洞与拆解的书几乎无关
import type { ChapterAnalysis, CharacterItem, WorldElement } from '../types';
import { clip } from './storyContext.ts';

const MAX_BEATS = 24; // 超出时保留开头 16 章与最后 8 章
const HEAD_BEATS = 16;
const SUMMARY_MAX_CHARS = 80;
const HOOK_MAX_CHARS = 50;
const MAX_ASSETS = 8;
const ASSET_TEXT_MAX_CHARS = 50;

export interface SkeletonInput {
  fileName: string;
  analyses: Record<number, ChapterAnalysis>;
  characters: CharacterItem[];
  worldElements: WorldElement[];
}

const beatLine = (a: ChapterAnalysis) =>
  `${a.chapter_title}：${clip(a.summary, SUMMARY_MAX_CHARS)}${a.narrative_hook.trim() ? `（章末钩子：${clip(a.narrative_hook, HOOK_MAX_CHARS)}）` : ''}`;

export function buildSkeletonFromAnalyses({ fileName, analyses, characters, worldElements }: SkeletonInput): string {
  const list = Object.values(analyses).sort((a, b) => a.chapter_id - b.chapter_id);
  if (list.length === 0) return '';
  const beats =
    list.length > MAX_BEATS
      ? [
          ...list.slice(0, HEAD_BEATS).map(beatLine),
          `……（中间省略 ${list.length - MAX_BEATS} 章）……`,
          ...list.slice(-(MAX_BEATS - HEAD_BEATS)).map(beatLine),
        ]
      : list.map(beatLine);
  const people = characters
    .slice(0, MAX_ASSETS)
    .map((c) => `- ${c.name}${c.role.trim() ? `（${clip(c.role, ASSET_TEXT_MAX_CHARS)}）` : ''}${c.inner_motivation.trim() ? `：${clip(c.inner_motivation, ASSET_TEXT_MAX_CHARS)}` : ''}`);
  const rules = worldElements
    .slice(0, MAX_ASSETS)
    .map((w) => `- ${w.term}（${w.category}）${w.description.trim() ? `：${clip(w.description, ASSET_TEXT_MAX_CHARS)}` : ''}`);

  return [
    `参考《${fileName.replace(/\.[^/.]+$/, '')}》的结构（已拆解 ${list.length} 章）：`,
    `【章节节拍】\n${beats.join('\n')}`,
    people.length > 0 ? `【主要人物】\n${people.join('\n')}` : '',
    rules.length > 0 ? `【核心设定】\n${rules.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
