// 针对某一章生成的分析结果（节奏诊断、防吃设定报告、主编旁批）：记下所属章节，
// 切换到别的章节时不显示，切回来仍在；请求期间切换了章节，结果也只归到发起时的那一章
export interface ChapterBound<T> {
  chapterId: string;
  data: T;
}

export function boundTo<T>(bound: ChapterBound<T> | null, chapterId: string): T | null {
  return bound && bound.chapterId === chapterId ? bound.data : null;
}
