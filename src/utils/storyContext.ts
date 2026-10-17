// AI 写作与设定检查用的「前情」：本卷大纲、人物与世界设定、已写章节、前一章结尾。
// 续写只看得到本章末尾，没有这些信息时，第二章起模型会给人物改名、另起炉灶。各部分都有长度上限，免得挤占正文。
import type { CharacterItem, StoryVolume, WorldElement } from '../types';

const OUTLINE_MAX_CHARS = 600;
const PREVIOUS_TAIL_CHARS = 1200;
const MAX_CHARACTERS = 12;
const MAX_WORLD_ELEMENTS = 10;
const ITEM_TEXT_MAX_CHARS = 60;
const HEAD_SHARE = 0.6; // 截取超长正文时开头占 60%，其余留给结尾（章末钩子）

const clip = (text: string, max: number) => {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// 超长正文保留开头与结尾，中间注明省略了多少字
export function excerptHeadTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * HEAD_SHARE);
  const tail = maxChars - head;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n……（中间省略 ${omitted} 字）……\n${text.slice(-tail)}`;
}

// 全书按卷、章顺序排开的章节列表
const flattenChapters = (volumes: StoryVolume[]) => volumes.flatMap((v) => v.chapters.map((c) => ({ volume: v, chapter: c })));

// 当前章之前最近一个有正文的章节的结尾（可跨卷）
export function buildPreviousChapterContext(volumes: StoryVolume[], chapterId: string): string {
  const all = flattenChapters(volumes);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  const previous = all.slice(0, Math.max(at, 0)).reverse().find((x) => x.chapter.content.trim());
  if (!previous) return '';
  const content = previous.chapter.content.trim();
  const tail = content.length > PREVIOUS_TAIL_CHARS ? `……${content.slice(-PREVIOUS_TAIL_CHARS)}` : content;
  return `【前一章《${previous.chapter.title.trim() || '未命名章节'}》结尾】\n${tail}`;
}

function describeCharacters(characters: CharacterItem[]): string {
  if (characters.length === 0) return '';
  const lines = characters.slice(0, MAX_CHARACTERS).map((c) => {
    const role = c.role.trim() ? `（${clip(c.role, ITEM_TEXT_MAX_CHARS)}）` : '';
    const gone = c.status === '退场/阵亡' ? '【已退场/阵亡】' : '';
    const motive = c.inner_motivation.trim() ? `：${clip(c.inner_motivation, ITEM_TEXT_MAX_CHARS)}` : '';
    return `- ${c.name}${role}${gone}${motive}`;
  });
  return `【人物设定】\n${lines.join('\n')}`;
}

function describeWorld(elements: WorldElement[]): string {
  if (elements.length === 0) return '';
  const lines = elements
    .slice(0, MAX_WORLD_ELEMENTS)
    .map((w) => `- ${w.term}（${w.category}）${w.description.trim() ? `：${clip(w.description, ITEM_TEXT_MAX_CHARS)}` : ''}`);
  return `【世界设定】\n${lines.join('\n')}`;
}

export interface StoryContextInput {
  volumes: StoryVolume[];
  chapterId: string;
  characters: CharacterItem[];
  worldElements: WorldElement[];
}

export function buildStoryContext({ volumes, chapterId, characters, worldElements }: StoryContextInput): string {
  const all = flattenChapters(volumes);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  const outline = at >= 0 ? all[at].volume.description.trim() : '';
  const earlierTitles = all.slice(0, Math.max(at, 0)).map((x) => x.chapter.title.trim() || '未命名章节');

  return [
    outline ? `【本卷大纲】（方向参考；与前文、人物设定冲突时以前文和设定为准）\n${clip(outline, OUTLINE_MAX_CHARS)}` : '',
    describeCharacters(characters),
    describeWorld(worldElements),
    earlierTitles.length > 0 ? `【已写章节】${earlierTitles.join(' → ')}` : '',
    buildPreviousChapterContext(volumes, chapterId),
  ]
    .filter(Boolean)
    .join('\n\n');
}
