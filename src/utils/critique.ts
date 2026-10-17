// 主编旁批的「采纳改写」与重新打开规则

export interface AdoptResult {
  content: string;
  appended: boolean; // 没找到原段落，改写示范追加到了章末
}

const SNIPPET_PROBE_LENGTH = 15;

// 定位批注所指的段落：批注段号（只数非空段，与 splitParagraphs 一致）那一段含有原文开头时用它，开头相同的段落不会认错；
// 否则找第一个含有原文开头、且不在 taken 里的段。空引文返回 -1，不会误指第一段
function findTargetParagraph(paras: string[], originalSnippet: string, paragraphIndex?: number, taken: ReadonlySet<number> = new Set()): number {
  const probe = originalSnippet.trim().slice(0, SNIPPET_PROBE_LENGTH);
  if (!probe) return -1;
  const fits = (i: number) => i >= 0 && !taken.has(i) && paras[i].includes(probe);
  const numbered = paras.flatMap((p, i) => (p.trim() ? [i] : []));
  const byNumber = paragraphIndex === undefined ? -1 : numbered[paragraphIndex - 1] ?? -1;
  return fits(byNumber) ? byNumber : paras.findIndex((_, i) => fits(i));
}

// 用示范改写替换正文中批注所指的那一段；原段落已被改动或引文为空时追加到章末，由调用方提示用户
export function adoptRewrite(content: string, originalSnippet: string, suggestion: string, paragraphIndex?: number): AdoptResult {
  const paras = content.split(/\n+/);
  const targetIdx = findTargetParagraph(paras, originalSnippet, paragraphIndex);
  if (targetIdx < 0) return { content: `${content}\n\n${suggestion}`, appended: true };
  return { content: paras.map((p, i) => (i === targetIdx ? suggestion : p)).join('\n\n'), appended: false };
}

interface RewriteCritique {
  index: number;
  paragraph_text: string;
  rewrite_suggestion?: string;
}

// 还没采纳、且带示范改写的批注（段号不会重复：critiqueDraftParagraphsWithLLM 已给重复段号重新编号）
export function pendingRewrites<T extends RewriteCritique>(list: ReadonlyArray<T>, adopted: ReadonlyArray<number>): T[] {
  return list.filter((c) => !!c.rewrite_suggestion && !adopted.includes(c.index));
}

export interface BulkAdoptResult {
  content: string;
  adopted: number[]; // 已替换的批注段号
  missing: number[]; // 找不到原段落、没有采纳的批注段号（不追加到章末，可单独采纳）
}

// 一键采纳：先在原文里定位全部段落再一起替换，免得前一条改写的文字被后一条当成原段
export function adoptAllRewrites(content: string, items: ReadonlyArray<RewriteCritique>): BulkAdoptResult {
  const paras = content.split(/\n+/);
  const replacements = new Map<number, string>();
  const adopted: number[] = [];
  const missing: number[] = [];
  for (const item of items) {
    const suggestion = item.rewrite_suggestion;
    const targetIdx = suggestion ? findTargetParagraph(paras, item.paragraph_text, item.index, new Set(replacements.keys())) : -1;
    if (!suggestion || targetIdx < 0) {
      missing.push(item.index);
      continue;
    }
    replacements.set(targetIdx, suggestion);
    adopted.push(item.index);
  }
  if (adopted.length === 0) return { content, adopted, missing };
  return { content: paras.map((p, i) => replacements.get(i) ?? p).join('\n\n'), adopted, missing };
}

// 工具栏「主编旁批」：本章已有批注而抽屉关着时只重新打开（手机端采纳、关闭后还能接着看其余批注）；
// 没有批注或抽屉正开着时发起新的批注
export function shouldRequestCritique(hasResults: boolean, drawerOpen: boolean): boolean {
  return !hasResults || drawerOpen;
}

// 主编旁批每次批注的段数；一章几十段时分批往下批
export const CRITIQUE_BATCH_SIZE = 10;

// 下一批从哪一段开始（0 起）；已批到章末返回 null。按已批注的最大段号算，批次里被模型跳过的段不再重复请求
export function nextCritiqueStart(paragraphCount: number, critiqued: ReadonlyArray<{ index: number }>): number | null {
  const covered = critiqued.reduce((max, item) => Math.max(max, item.index), 0);
  return covered < paragraphCount ? covered : null;
}
