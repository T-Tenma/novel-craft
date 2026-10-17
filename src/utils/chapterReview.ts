import type { ReviewReport } from '../types';

// 审稿报告按章节保存，并记下送审时的正文，用于判断报告是否已过时
export interface ChapterReview {
  report: ReviewReport;
  reviewedContent: string;
}

// 只返回当前章节自己的报告：切换章节后不能把上一章的结论显示成本章的
export function getChapterReview(
  reviews: Record<string, ChapterReview>,
  chapterId: string,
  currentContent: string
): { report: ReviewReport; isStale: boolean } | null {
  const entry = reviews[chapterId];
  if (!entry) return null;
  return { report: entry.report, isStale: entry.reviewedContent !== currentContent };
}
