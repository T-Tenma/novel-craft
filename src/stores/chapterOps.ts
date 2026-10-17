import type { ChapterPlan, ChapterSummary, StoryChapter, StoryVolume } from '../types';

export type ChapterWriteMode = 'replace' | 'append';

export const countWords = (content: string) => content.replace(/\s+/g, '').length;

export function findChapter(volumes: StoryVolume[], chapterId: string): StoryChapter | undefined {
  return volumes.flatMap((v) => v.chapters).find((c) => c.id === chapterId);
}

// AI 生成文本写入章节：append 在原文后空一行续上，replace 整体替换
export function composeChapterText(current: string, addition: string, mode: ChapterWriteMode): string {
  const text = addition.trim();
  if (mode === 'replace' || !current.trim()) return text;
  return `${current.trimEnd()}\n\n${text}`;
}

// 写作章节参考的原著章节：优先用章节绑定的 reference_chapter_id（且存在于当前原著中），否则跟随拆解页当前选中的章节。
// 原著章节 id 可能为 0（引子），不能用真值判断
export function resolveReferenceChapterId(
  boundId: number | undefined,
  selectedId: number | null,
  availableIds: number[]
): number | null {
  if (boundId !== undefined && availableIds.includes(boundId)) return boundId;
  return selectedId !== null && availableIds.includes(selectedId) ? selectedId : null;
}

// 绑定 / 解除绑定写作章节的原著参考；undefined 表示改回「跟随拆解页」
export function setChapterReference(volumes: StoryVolume[], chapterId: string, referenceId: number | undefined): StoryVolume[] {
  return volumes.map((v) => ({
    ...v,
    chapters: v.chapters.map((c) => {
      if (c.id !== chapterId) return c;
      const { reference_chapter_id: _previous, ...rest } = c;
      return referenceId === undefined ? rest : { ...rest, reference_chapter_id: referenceId };
    }),
  }));
}

// 章节所在的卷与位置，用于撤销删除
export function locateChapter(volumes: StoryVolume[], chapterId: string): { volumeId: string; index: number } | null {
  for (const v of volumes) {
    const index = v.chapters.findIndex((c) => c.id === chapterId);
    if (index >= 0) return { volumeId: v.id, index };
  }
  return null;
}

// 把删除的章节放回原卷原位置；原卷已不存在时返回 null
export function restoreChapterAt(
  volumes: StoryVolume[],
  volumeId: string,
  index: number,
  chapter: StoryChapter
): StoryVolume[] | null {
  if (!volumes.some((v) => v.id === volumeId)) return null;
  return volumes.map((v) => {
    if (v.id !== volumeId) return v;
    const at = Math.min(Math.max(index, 0), v.chapters.length);
    return { ...v, chapters: [...v.chapters.slice(0, at), chapter, ...v.chapters.slice(at)] };
  });
}

export function setChapterContent(volumes: StoryVolume[], chapterId: string, content: string): StoryVolume[] {
  return volumes.map((v) => ({
    ...v,
    chapters: v.chapters.map((c) => (c.id === chapterId ? { ...c, content, word_count: countWords(content) } : c)),
  }));
}

function updateChapter(volumes: StoryVolume[], chapterId: string, update: (chapter: StoryChapter) => StoryChapter): StoryVolume[] {
  return volumes.map((v) =>
    v.chapters.some((c) => c.id === chapterId) ? { ...v, chapters: v.chapters.map((c) => (c.id === chapterId ? update(c) : c)) } : v,
  );
}

// 章细纲：按输入原样保存（行尾换行要留着才能接着写），只剩空白时去掉字段
export function setChapterOutline(volumes: StoryVolume[], chapterId: string, outline: string): StoryVolume[] {
  return updateChapter(volumes, chapterId, ({ outline: _previous, ...rest }) => (outline.trim() ? { ...rest, outline } : rest));
}

export function setChapterSummary(volumes: StoryVolume[], chapterId: string, summary: ChapterSummary): StoryVolume[] {
  return updateChapter(volumes, chapterId, (c) => ({ ...c, summary }));
}

// 本卷最后一个有正文的章节之后、还没写正文的章节：拆出的细纲依次填进这些章节（原有的细纲被替换），多出来的新建章节
export function unwrittenTail(chapters: StoryChapter[]): StoryChapter[] {
  const lastWritten = chapters.map((c) => !!c.content.trim()).lastIndexOf(true);
  return chapters.slice(lastWritten + 1);
}

export function applyChapterPlans(
  volumes: StoryVolume[],
  volumeId: string,
  plans: ChapterPlan[],
  makeId: (index: number) => string,
): { volumes: StoryVolume[]; firstChapterId: string | null } {
  const volume = volumes.find((v) => v.id === volumeId);
  if (!volume || plans.length === 0) return { volumes, firstChapterId: null };
  const slotIds = unwrittenTail(volume.chapters).map((c) => c.id);
  const planFor = (chapterId: string) => plans[slotIds.indexOf(chapterId)];
  const filled = volume.chapters.map((c): StoryChapter => {
    const plan = slotIds.includes(c.id) ? planFor(c.id) : undefined;
    if (!plan) return c;
    const { summary: _stale, ...rest } = c;
    return { ...rest, title: plan.title, outline: plan.outline };
  });
  const added = plans.slice(slotIds.length).map((plan, i): StoryChapter => ({
    id: makeId(i),
    title: plan.title,
    content: '',
    word_count: 0,
    status: 'draft',
    outline: plan.outline,
  }));
  const next = volumes.map((v) => (v.id === volumeId ? { ...v, chapters: [...filled, ...added] } : v));
  return { volumes: next, firstChapterId: slotIds[0] ?? added[0]?.id ?? null };
}

export interface ActiveDraft {
  activeChapterId: string;
  draftTitle: string;
  draftContent: string;
}

export interface ChapterRemoval extends ActiveDraft {
  volumes: StoryVolume[];
}

// 编辑器草稿永远取自活动章节；活动章节不存在时退回第一章，没有章节时为空
export function resolveActiveDraft(volumes: StoryVolume[], activeChapterId: string): ActiveDraft {
  const allChapters = volumes.flatMap((v) => v.chapters);
  const active = allChapters.find((c) => c.id === activeChapterId) ?? allChapters[0];
  return {
    activeChapterId: active?.id ?? '',
    draftTitle: active?.title ?? '',
    draftContent: active?.content ?? '',
  };
}

// 删除章节后，活动章节与编辑器草稿必须指向同一章；否则下一次输入会把旧草稿写进别的章节
export function removeChapter(volumes: StoryVolume[], chapterId: string, activeChapterId: string): ChapterRemoval {
  const nextVolumes = volumes.map((v) => ({
    ...v,
    chapters: v.chapters.filter((c) => c.id !== chapterId),
  }));
  return { volumes: nextVolumes, ...resolveActiveDraft(nextVolumes, activeChapterId) };
}

// 删除整卷：活动章节在该卷时，草稿随之切到剩余的第一章（规则同 removeChapter）
export function removeVolume(volumes: StoryVolume[], volumeId: string, activeChapterId: string): ChapterRemoval {
  const nextVolumes = volumes.filter((v) => v.id !== volumeId);
  return { volumes: nextVolumes, ...resolveActiveDraft(nextVolumes, activeChapterId) };
}

// 撤销删除整卷：放回原位置；该卷已存在时不重复插入
export function restoreVolumeAt(volumes: StoryVolume[], index: number, volume: StoryVolume): StoryVolume[] {
  if (volumes.some((v) => v.id === volume.id)) return volumes;
  const at = Math.min(Math.max(index, 0), volumes.length);
  return [...volumes.slice(0, at), volume, ...volumes.slice(at)];
}

export function updateVolumeInfo(volumes: StoryVolume[], volumeId: string, title: string, description: string): StoryVolume[] {
  return volumes.map((v) => (v.id === volumeId ? { ...v, title, description } : v));
}

// 章节标题可以在编辑时清空；列表、下拉框、导出与提示里显示时用「未命名章节」兜底
export const UNTITLED_CHAPTER = '未命名章节';
export function chapterTitleOrDefault(title: string): string {
  return title.trim() || UNTITLED_CHAPTER;
}
