// 章节摘要的过期判断：摘要记下生成时正文的指纹，正文改过后提示重新生成
import type { StoryChapter } from '../types';

// FNV-1a 32 位：只用来判断正文有没有变，不做安全用途
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export type SummaryStatus = 'none' | 'fresh' | 'stale';

export function summaryStatus(chapter: StoryChapter): SummaryStatus {
  if (!chapter.summary) return 'none';
  return chapter.summary.content_hash === hashText(chapter.content) ? 'fresh' : 'stale';
}

// 写了正文、但还没有摘要或摘要已过期的章节
export function chaptersNeedingSummary(chapters: StoryChapter[]): StoryChapter[] {
  return chapters.filter((c) => c.content.trim() && summaryStatus(c) !== 'fresh');
}
