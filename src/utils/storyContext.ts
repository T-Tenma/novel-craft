// AI 写作与设定检查用的「前情」：本卷大纲、人物与世界设定、已写章节、前一章结尾。
// 续写只看得到本章末尾，没有这些信息时，第二章起模型会给人物改名、另起炉灶。各部分都有长度上限，免得挤占正文。
import type { CharacterItem, StoryVolume, WorldElement } from '../types';

const OUTLINE_MAX_CHARS = 600;
// 前一章整章带上（一章约 3000 字）；更长时保留开头与结尾，结尾仍有 1200 字给下一章开头衔接
const PREVIOUS_CHAPTER_MAX_CHARS = 3000;
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

// 当前章之前最近一个有正文的章节（可跨卷）。只给结尾时，前一章前半段发生的事（如道具已离体）模型不知道，防吃设定会误报
export function buildPreviousChapterContext(volumes: StoryVolume[], chapterId: string): string {
  const all = flattenChapters(volumes);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  const previous = all.slice(0, Math.max(at, 0)).reverse().find((x) => x.chapter.content.trim());
  if (!previous) return '';
  const content = excerptHeadTail(previous.chapter.content.trim(), PREVIOUS_CHAPTER_MAX_CHARS);
  return `【前一章《${previous.chapter.title.trim() || '未命名章节'}》（最后一段即章末）】\n${content}`;
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

const LATER_SETTING_MARK = '【前文未见，可能是后文设定】';

// 名字的几种写法：「方执事（方秉诚）」算「方执事」「方秉诚」两种，书名号等括号不算
const nameVariants = (name: string) =>
  name
    .split(/[（）()／/、·\s]+/)
    .map((part) => part.replace(/[《》【】「」『』]/g, '').trim())
    .filter((part) => part.length >= 2);

// 到这一章为止（含本章）的正文里出现过这个名字。设定集是全书的，后文才登场的设定在早先的章节里本来就没有；
// 找不到章节、或名字拆不出两字以上的写法时一律当作出现过，不加标记
function appearedBy(volumes: StoryVolume[], chapterId: string): (name: string) => boolean {
  const all = flattenChapters(volumes);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  if (at < 0) return () => true;
  const text = all.slice(0, at + 1).map((x) => x.chapter.content).join('\n');
  return (name) => {
    const variants = nameVariants(name);
    return variants.length === 0 || variants.some((variant) => text.includes(variant));
  };
}

// 送审用的人物与设定。只按名字匹配，别称（「诛绝禁制」写成「诛绝大阵」）会被当成没出现——那只是少要求一条，不会误判
export function buildReviewContext({ volumes, chapterId, characters, worldElements }: StoryContextInput): string {
  const appeared = appearedBy(volumes, chapterId);
  const mark = (name: string) => (appeared(name) ? '' : LATER_SETTING_MARK);
  const people = characters.map((c) => {
    const detail = [c.role, c.inner_motivation.trim() ? `动机:${c.inner_motivation}` : ''].filter(Boolean).join(', ');
    const gone = c.status === '退场/阵亡' ? '【已退场/阵亡】' : '';
    return `${c.name}${detail ? `(${detail})` : ''}${gone}${mark(c.name)}`;
  });
  const rules = worldElements.map((w) => `${w.term}(${w.description})${mark(w.term)}`);
  const hasLater = [...people, ...rules].some((line) => line.includes(LATER_SETTING_MARK));
  const hasGone = characters.some((c) => c.status === '退场/阵亡');
  return [
    people.length > 0 ? `【小说角色动机】：${people.join('; ')}` : '',
    rules.length > 0 ? `【核心设定法则】：${rules.join('; ')}` : '',
    hasLater ? `标${LATER_SETTING_MARK}的条目，到本章为止的正文里还没出现过这个名字：本章没写到不算缺失，也不要因此扣分。` : '',
    hasGone ? '【已退场/阵亡】是全书最新进度里的状态，人物在退场之前的章节里照常出场不算问题。' : '',
  ]
    .filter(Boolean)
    .join('\n');
}
