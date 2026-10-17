// AI 写作与设定检查用的「前情」：本卷大纲、人物与世界设定、前情提要、前一章、本章与下一章细纲。
// 续写只看得到本章末尾，没有这些信息时，第二章起模型会给人物改名、另起炉灶。各部分都有长度上限，免得挤占正文。
import type { CharacterItem, StoryChapter, StoryVolume, WorldElement } from '../types';
import { summaryStatus } from './chapterSummary.ts';

const OUTLINE_MAX_CHARS = 600;
// 前情提要里摘要部分的总长；更早的章节只列标题
const RECAP_MAX_CHARS = 3000;
const CHAPTER_OUTLINE_MAX_CHARS = 1000;
const NEXT_OUTLINE_MAX_CHARS = 300;
// 前一章整章带上（一章约 3000 字）；更长时保留开头与结尾，结尾仍有 1200 字给下一章开头衔接
const PREVIOUS_CHAPTER_MAX_CHARS = 3000;
const MAX_CHARACTERS = 12;
const MAX_WORLD_ELEMENTS = 10;
const ITEM_TEXT_MAX_CHARS = 60;
const HEAD_SHARE = 0.6; // 截取超长正文时开头占 60%，其余留给结尾（章末钩子）

export const clip = (text: string, max: number) => {
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

// 当前章所属这本书的卷。项目里可能先后有几本书（演示内容、上一本书）：往前到最近一个「开始一本新书」的卷，
// 往后到下一本书之前；手动加的卷仍属于这本书。找不到章节时返回整个项目
export function bookVolumes(volumes: StoryVolume[], chapterId: string): StoryVolume[] {
  return bookAround(volumes, volumes.findIndex((v) => v.chapters.some((c) => c.id === chapterId)));
}

// 某一卷所属这本书的卷（空卷也能定位）
export function bookVolumesOf(volumes: StoryVolume[], volumeId: string): StoryVolume[] {
  return bookAround(volumes, volumes.findIndex((v) => v.id === volumeId));
}

function bookAround(volumes: StoryVolume[], at: number): StoryVolume[] {
  if (at < 0) return volumes;
  let start = at;
  while (start > 0 && !volumes[start].starts_new_book) start -= 1;
  let end = at + 1;
  while (end < volumes.length && !volumes[end].starts_new_book) end += 1;
  return volumes.slice(start, end);
}

// 这本书按卷、章顺序排开的章节列表；之前的书不算前情
const flattenChapters = (volumes: StoryVolume[], chapterId: string) =>
  bookVolumes(volumes, chapterId).flatMap((v) => v.chapters.map((c) => ({ volume: v, chapter: c })));

// 当前章之前最近一个有正文的章节（可跨卷）。只给结尾时，前一章前半段发生的事（如道具已离体）模型不知道，防吃设定会误报
export function buildPreviousChapterContext(volumes: StoryVolume[], chapterId: string): string {
  const all = flattenChapters(volumes, chapterId);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  const previous = all.slice(0, Math.max(at, 0)).reverse().find((x) => x.chapter.content.trim());
  if (!previous) return '';
  const content = excerptHeadTail(previous.chapter.content.trim(), PREVIOUS_CHAPTER_MAX_CHARS);
  return `【前一章《${previous.chapter.title.trim() || '未命名章节'}》（最后一段即章末）】\n${content}`;
}

const chapterName = (c: StoryChapter) => c.title.trim() || '未命名章节';

// 前情提要：本书前面写过的章节按顺序列出，有摘要的带上摘要与状态变化。摘要总长超过上限时，
// 从最近的章节往前保留，更早的只列标题——前一章之前的事以前只能靠作者手动更新人物卡、设定卡
export function buildRecap(chapters: StoryChapter[]): string {
  const written = chapters.filter((c) => c.content.trim() || c.summary);
  if (written.length === 0) return '';
  let budget = RECAP_MAX_CHARS;
  const lines = [...written].reverse().map((c) => {
    const summary = c.summary;
    if (!summary || budget <= 0) return `- ${chapterName(c)}`;
    const changes = summary.state_changes.length > 0 ? `（变化：${summary.state_changes.join('；')}）` : '';
    const stale = summaryStatus(c) === 'stale' ? '（摘要生成后正文又改过，可能不准）' : '';
    const detail = `：${summary.text}${changes}${stale}`;
    if (detail.length > budget) {
      budget = 0;
      return `- ${chapterName(c)}`;
    }
    budget -= detail.length;
    return `- ${chapterName(c)}${detail}`;
  });
  return `【前情提要】（本书前面各章，按顺序；人物去向、道具归属与数字以此为准）\n${lines.reverse().join('\n')}`;
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

// 到这一章为止（含本章）的前情提要：按前情更新设定卡时用
export function recapThrough(volumes: StoryVolume[], chapterId: string): string {
  const all = flattenChapters(volumes, chapterId);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  return buildRecap(all.slice(0, at + 1).map((x) => x.chapter));
}

// 只有人物卡与设定卡（生成摘要时用来认人认物）
export function buildCardContext(characters: CharacterItem[], worldElements: WorldElement[]): string {
  return [describeCharacters(characters), describeWorld(worldElements)].filter(Boolean).join('\n\n');
}

export interface StoryContextInput {
  volumes: StoryVolume[];
  chapterId: string;
  characters: CharacterItem[];
  worldElements: WorldElement[];
}

export function buildStoryContext({ volumes, chapterId, characters, worldElements }: StoryContextInput): string {
  const all = flattenChapters(volumes, chapterId);
  const at = all.findIndex((x) => x.chapter.id === chapterId);
  const outline = at >= 0 ? all[at].volume.description.trim() : '';
  const chapterOutline = at >= 0 ? all[at].chapter.outline ?? '' : '';
  const nextOutline = at >= 0 ? all[at + 1]?.chapter.outline ?? '' : '';

  return [
    outline ? `【本卷大纲】（方向参考；与前文、人物设定冲突时以前文和设定为准）\n${clip(outline, OUTLINE_MAX_CHARS)}` : '',
    describeCharacters(characters),
    describeWorld(worldElements),
    buildRecap(all.slice(0, Math.max(at, 0)).map((x) => x.chapter)),
    buildPreviousChapterContext(volumes, chapterId),
    chapterOutline ? `【本章细纲】（本章要写的内容，按它推进，章末停在它写的落点）\n${clip(chapterOutline, CHAPTER_OUTLINE_MAX_CHARS)}` : '',
    nextOutline ? `【下一章细纲】（留给下一章，本章不要提前写）\n${clip(nextOutline, NEXT_OUTLINE_MAX_CHARS)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const LATER_SETTING_MARK = '【前文未见，可能是后文设定】';

// 名字的几种写法：「方执事（方秉诚）」算「方执事」「方秉诚」两种，书名号等括号不算
export const nameVariants = (name: string) =>
  name
    .split(/[（）()／/、·\s]+/)
    .map((part) => part.replace(/[《》【】「」『』]/g, '').trim())
    .filter((part) => part.length >= 2);

// 到这一章为止（含本章）的正文里出现过这个名字。设定集是全书的，后文才登场的设定在早先的章节里本来就没有；
// 找不到章节、或名字拆不出两字以上的写法时一律当作出现过，不加标记
function appearedBy(volumes: StoryVolume[], chapterId: string): (name: string) => boolean {
  const all = flattenChapters(volumes, chapterId);
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
  const chapterOutline = flattenChapters(volumes, chapterId).find((x) => x.chapter.id === chapterId)?.chapter.outline ?? '';
  return [
    people.length > 0 ? `【小说角色动机】：${people.join('; ')}` : '',
    rules.length > 0 ? `【核心设定法则】：${rules.join('; ')}` : '',
    hasLater ? `标${LATER_SETTING_MARK}的条目，到本章为止的正文里还没出现过这个名字：本章没写到不算缺失，也不要因此扣分。` : '',
    hasGone ? '【已退场/阵亡】是全书最新进度里的状态，人物在退场之前的章节里照常出场不算问题。' : '',
    chapterOutline ? `【本章细纲】（作者为本章定的内容；没写到的节拍在缺点或修改建议里指出）\n${clip(chapterOutline, CHAPTER_OUTLINE_MAX_CHARS)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
