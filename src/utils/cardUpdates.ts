// 设定卡更新建议的匹配与合并：按名字找现有的卡，只改建议里给出的字段；找不到就新增一张
import type { CardUpdateSuggestion, CharacterItem, WorldElement } from '../types';
import { nameVariants } from './storyContext.ts';

export interface StoryCards {
  characters: CharacterItem[];
  worldElements: WorldElement[];
}

// 对不上任何卡：新增；对上不止一张、分不出是哪张：不改也不新增
export const AMBIGUOUS_CARD = -2;

// 名字完全一致的优先；否则按写法对（「方执事（方秉诚）」对得上「方秉诚」），取共有写法最多的那张，打平算分不清
export function findCardIndex(names: string[], name: string): number {
  const exact = names.findIndex((n) => n.trim() === name.trim());
  if (exact >= 0) return exact;
  const wanted = nameVariants(name);
  const scores = names.map((n) => nameVariants(n).filter((v) => wanted.includes(v)).length);
  const best = Math.max(0, ...scores);
  if (best === 0) return -1;
  return scores.filter((score) => score === best).length === 1 ? scores.indexOf(best) : AMBIGUOUS_CARD;
}

export function applyCardSuggestion(cards: StoryCards, s: CardUpdateSuggestion): StoryCards {
  if (s.target === 'character') {
    const at = findCardIndex(cards.characters.map((c) => c.name), s.name);
    if (at === AMBIGUOUS_CARD) return cards;
    const characters =
      at >= 0
        ? cards.characters.map((c, i) => (i === at ? { ...c, ...s.changes } : c))
        : [...cards.characters, { name: s.name, status: '新登场' as const, role: '', key_action: '', inner_motivation: '', ...s.changes }];
    return { ...cards, characters };
  }
  const at = findCardIndex(cards.worldElements.map((w) => w.term), s.name);
  if (at === AMBIGUOUS_CARD) return cards;
  const worldElements =
    at >= 0
      ? cards.worldElements.map((w, i) => (i === at ? { ...w, ...s.changes } : w))
      : [...cards.worldElements, { term: s.name, category: '其他' as const, description: '', ...s.changes }];
  return { ...cards, worldElements };
}

const FIELD_LABELS: Record<string, string> = {
  status: '状态',
  role: '身份',
  key_action: '关键行动',
  inner_motivation: '动机',
  category: '类别',
  description: '说明',
};

// 给界面看的一条建议：改哪张卡、哪些字段怎么变；什么都不变的建议返回 null
export function describeCardSuggestion(cards: StoryCards, s: CardUpdateSuggestion): { title: string; lines: string[] } | null {
  const kind = s.target === 'character' ? '人物' : '设定';
  const names = s.target === 'character' ? cards.characters.map((c) => c.name) : cards.worldElements.map((w) => w.term);
  const at = findCardIndex(names, s.name);
  if (at === AMBIGUOUS_CARD) return null;
  const current: Record<string, string> | null =
    at < 0 ? null : s.target === 'character' ? { ...cards.characters[at] } : { ...cards.worldElements[at] };
  const lines = Object.entries(s.changes)
    .filter(([key, value]) => value && current?.[key] !== value)
    .map(([key, value]) => `${FIELD_LABELS[key] ?? key}：${current?.[key] ? `${current[key]} → ` : ''}${value}`);
  if (lines.length === 0) return null;
  return { title: current ? `更新${kind}「${names[at]}」` : `新增${kind}「${s.name}」`, lines };
}
