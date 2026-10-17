// 「AI 拆细纲」的范围：这本书在本卷之前写到哪（前情），本卷哪些章节还没写（细纲填进去），新细纲从第几章编号
import type { BrainwaveIdea, ChapterPlan, CharacterItem, StoryChapter, StoryVolume, WorldElement } from '../types';
import { unwrittenTail } from '../stores/chapterOps.ts';
import { bookVolumesOf, buildCardContext, buildRecap } from './storyContext.ts';

const LATEST_TAIL_CHARS = 800;

export interface PlanScope {
  earlier: StoryChapter[];
  slots: StoryChapter[];
  startNumber: number;
}

export function planScope(volumes: StoryVolume[], volumeId: string): PlanScope {
  const book = bookVolumesOf(volumes, volumeId);
  const at = book.findIndex((v) => v.id === volumeId);
  const volume = book[at];
  if (!volume) return { earlier: [], slots: [], startNumber: 1 };
  const slots = unwrittenTail(volume.chapters);
  const earlier = [
    ...book.slice(0, at).flatMap((v) => v.chapters),
    ...volume.chapters.slice(0, volume.chapters.length - slots.length),
  ];
  return { earlier, slots, startNumber: earlier.length + 1 };
}

// 拆细纲的前情：设定、前情提要、最新一章的结尾（下一章从这里接）
export function buildPlanContext(scope: PlanScope, characters: CharacterItem[], worldElements: WorldElement[]): string {
  const latest = [...scope.earlier].reverse().find((c) => c.content.trim());
  return [
    buildCardContext(characters, worldElements),
    buildRecap(scope.earlier),
    latest ? `【最新一章《${latest.title.trim() || '未命名章节'}》结尾】\n${latest.content.trim().slice(-LATEST_TAIL_CHARS)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const DIGITS = '零一二三四五六七八九';
const UNITS = ['', '十', '百', '千'];

// 章号写成汉字：6 → 六，105 → 一百零五（一万以内）
export function toChineseNumber(n: number): string {
  if (n < 20) return n < 10 ? DIGITS[n] : `十${n % 10 ? DIGITS[n % 10] : ''}`;
  const digits = String(n).split('').map(Number);
  return digits
    .map((d, i) => (d ? `${digits[i - 1] === 0 ? '零' : ''}${DIGITS[d]}${UNITS[digits.length - 1 - i]}` : ''))
    .join('');
}

const ARABIC_NUMBERED = /^第\s*(\d{1,4})\s*章/;
const CHINESE_NUMBERED = /^第[零〇一二三四五六七八九十百千两]+章/;

// 提示里写的是「从第 6 章开始」，模型常照抄成「第6章」；本书前面用汉字编号时改成同样的写法
export function matchChapterNumbering(plans: ChapterPlan[], earlier: StoryChapter[]): ChapterPlan[] {
  const reference = [...earlier].reverse().find((c) => ARABIC_NUMBERED.test(c.title.trim()) || CHINESE_NUMBERED.test(c.title.trim()));
  if (!reference || !CHINESE_NUMBERED.test(reference.title.trim())) return plans;
  return plans.map((p) => ({ ...p, title: p.title.replace(ARABIC_NUMBERED, (_, n: string) => `第${toChineseNumber(Number(n))}章`) }));
}

// 选中的脑洞当全书大纲
export function describeIdea(idea: BrainwaveIdea | null): string {
  if (!idea) return '';
  const { act1, act2, act3 } = idea.three_act_beats;
  return `书名《${idea.title}》，题材：${idea.genre}\n金手指：${idea.golden_finger}\n核心冲突：${idea.main_conflict}\n【起】${act1}\n【承】${act2}\n【转合】${act3}`;
}

