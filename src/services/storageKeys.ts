// 书库存储的键与小说 ID 规则（与 SQLite 中的 novel_id 一致）

export const toNovelId = (fileName: string) => fileName.replace(/[^a-zA-Z0-9_一-龥]/g, '_');

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 浏览器降级存储的单章拆解缓存键为 novel_analysis_{novelId}_{chapterId}。
// 必须精确匹配「ID + 章节数字」，否则 a_txt 会误删 a_txt2_txt 等 ID 前缀相同的其他小说
export function isAnalysisCacheKey(key: string, novelId: string): boolean {
  return new RegExp(`^novel_analysis_${escapeRegExp(novelId)}_\\d+$`).test(key);
}

// 与 window.localStorage 相同的最小接口，便于测试
export interface CacheStorage {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

// 清掉某本小说的全部单章拆解缓存（删除这本书、或同名重新导入覆盖旧书时）；正文、书库索引与其他书不动
export function clearAnalysisCaches(storage: CacheStorage, novelId: string): void {
  Array.from({ length: storage.length }, (_, i) => storage.key(i))
    .filter((key): key is string => key !== null && isAnalysisCacheKey(key, novelId))
    .forEach((key) => storage.removeItem(key));
}
