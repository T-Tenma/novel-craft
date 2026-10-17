// 「润色」是整章替换：篇幅变化过大往往说明模型改写了情节或设定，提醒作者核对，必要时撤销
const MAX_GROWTH = 1.3;
const MAX_SHRINK = 0.7;

const countChars = (text: string) => text.replace(/\s+/g, '').length;

export function polishLengthWarning(before: string, after: string): string | null {
  const from = countChars(before);
  const to = countChars(after);
  if (from === 0) return null;
  const ratio = to / from;
  if (ratio <= MAX_GROWTH && ratio >= MAX_SHRINK) return null;
  const percent = Math.round((ratio - 1) * 100);
  return `润色后篇幅从 ${from} 字变为 ${to} 字（${percent > 0 ? '+' : ''}${percent}%），请核对人名、时间等设定有没有被改动，不满意可点「撤销」`;
}
