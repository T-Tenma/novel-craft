// 段落切分、送审文本编号、以及 LLM 段落批注到界面段落的对齐。
// 界面展示和发给模型的正文必须使用同一套切分，段落编号才能对得上。

const HEAD_SHARE = 0.6; // 超长章节：开头占 60% 预算，其余留给结尾（断章钩子在章末）
const MIN_PARTIAL_CHARS = 20;
const TRUNCATED_END_NOTE = '……（本段过长已截断）';
const TRUNCATED_START_NOTE = '（本段过长，前文已截断）……';
const OMISSION_MARKER = '[……中间省略部分段落……]';
const EXCERPT_KEY_LENGTH = 12;
const MIN_EXCERPT_KEY_LENGTH = 4;

export function splitParagraphs(content: string): string[] {
  return content.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

const prefix = (i: number) => `[${i + 1}] `;

function takeFromStart(paragraphs: string[], budget: number) {
  const parts: string[] = [];
  let used = 0;
  let fullCount = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const line = prefix(i) + paragraphs[i];
    if (used + line.length + 1 <= budget) {
      parts.push(line);
      used += line.length + 1;
      fullCount++;
      continue;
    }
    const room = budget - used - prefix(i).length - TRUNCATED_END_NOTE.length - 1;
    if (room >= MIN_PARTIAL_CHARS) parts.push(prefix(i) + paragraphs[i].slice(0, room) + TRUNCATED_END_NOTE);
    break;
  }
  return { parts, fullCount };
}

function takeFromEnd(paragraphs: string[], budget: number, stopBefore: number) {
  const parts: string[] = [];
  let used = 0;
  let firstIndex = paragraphs.length;
  let firstIsFull = true;
  for (let i = paragraphs.length - 1; i >= stopBefore; i--) {
    const line = prefix(i) + paragraphs[i];
    if (used + line.length + 1 <= budget) {
      parts.unshift(line);
      used += line.length + 1;
      firstIndex = i;
      continue;
    }
    const room = budget - used - prefix(i).length - TRUNCATED_START_NOTE.length - 1;
    if (room >= MIN_PARTIAL_CHARS) {
      parts.unshift(prefix(i) + TRUNCATED_START_NOTE + paragraphs[i].slice(-room));
      firstIndex = i;
      firstIsFull = false;
    }
    break;
  }
  return { parts, firstIndex, firstIsFull };
}

// 生成 "[n] 段落" 形式的正文；超出 maxChars 时保留开头与结尾，编号保持原始段号。
// 同一超长段落可能被拆成「开头截断 + 结尾截断」两行，但不会出现完整重复。
export function buildNumberedChapterText(paragraphs: string[], maxChars: number): string {
  const full = paragraphs.map((p, i) => prefix(i) + p).join('\n');
  if (full.length <= maxChars) return full;

  const headBudget = Math.floor(maxChars * HEAD_SHARE);
  const head = takeFromStart(paragraphs, headBudget);
  const tail = takeFromEnd(paragraphs, maxChars - headBudget, head.fullCount);

  // 结尾已完整收录开头被截断的那一段时，丢掉开头的截断片段
  const tailCoversHeadPartial = tail.firstIsFull && tail.firstIndex === head.fullCount;
  const headParts = tailCoversHeadPartial ? head.parts.slice(0, head.fullCount) : head.parts;
  const hasOmittedParagraphs = tail.firstIndex > headParts.length;
  return [...headParts, ...(hasOmittedParagraphs ? [OMISSION_MARKER] : []), ...tail.parts].join('\n');
}

// 同一段落（index 相同）只保留最新一次剖析
export function upsertParagraphAnalysis<T extends { index: number }>(list: readonly T[] | undefined, item: T): T[] {
  const current = list ?? [];
  return current.some((p) => p.index === item.index)
    ? current.map((p) => (p.index === item.index ? item : p))
    : [...current, item];
}

interface ParagraphAnalysisLike {
  index?: unknown;
  paragraph_excerpt?: unknown;
}

function excerptKey(excerpt: unknown): string | null {
  if (typeof excerpt !== 'string') return null;
  const key = excerpt.trim().replace(/[.。…]+$/, '').slice(0, EXCERPT_KEY_LENGTH);
  return key.length >= MIN_EXCERPT_KEY_LENGTH ? key : null;
}

// 返回 段落下标 -> 批注。一个段落只认领一条批注，没有批注的段落不做兜底。按可信度分三轮：
// 1) 编号对应的段落包含摘录 → 直接采用；2) 编号对不上时按摘录找段落（兼容旧数据的序号错位）；3) 仅有编号
export function assignParagraphAnalyses<T extends ParagraphAnalysisLike>(
  paragraphs: string[],
  analyses: ReadonlyArray<T | null | undefined> | undefined,
): Map<number, T> {
  const assigned = new Map<number, T>();
  const items = (analyses ?? [])
    .filter((a): a is T => !!a && typeof a === 'object')
    .map((item) => {
      const idx = typeof item.index === 'number' ? item.index - 1 : -1;
      return { item, key: excerptKey(item.paragraph_excerpt), idx: idx >= 0 && idx < paragraphs.length ? idx : -1 };
    });
  const claim = (idx: number, item: T) => {
    if (idx < 0 || assigned.has(idx)) return false;
    assigned.set(idx, item);
    return true;
  };

  const unconfirmed: typeof items = [];
  for (const entry of items) {
    const confirmed = entry.key !== null && entry.idx >= 0 && paragraphs[entry.idx].includes(entry.key);
    if (!(confirmed && claim(entry.idx, entry.item))) unconfirmed.push(entry);
  }

  const indexOnly: typeof items = [];
  for (const entry of unconfirmed) {
    const { key } = entry;
    const byExcerpt = key ? paragraphs.findIndex((p, i) => !assigned.has(i) && p.includes(key)) : -1;
    if (!claim(byExcerpt, entry.item)) indexOnly.push(entry);
  }

  for (const entry of indexOnly) claim(entry.idx, entry.item);
  return assigned;
}
