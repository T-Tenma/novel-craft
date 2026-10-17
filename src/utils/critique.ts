// 主编旁批的「采纳改写」与重新打开规则

export interface AdoptResult {
  content: string;
  appended: boolean; // 没找到原段落，改写示范追加到了章末
}

const SNIPPET_PROBE_LENGTH = 15;

// 用示范改写替换正文中批注所指的那一段（按原文开头定位）；原段落已被改动或引文为空时追加到章末，
// 由调用方提示用户，空引文不会误替换第一段
export function adoptRewrite(content: string, originalSnippet: string, suggestion: string): AdoptResult {
  const paras = content.split(/\n+/);
  const probe = originalSnippet.trim().slice(0, SNIPPET_PROBE_LENGTH);
  const targetIdx = probe ? paras.findIndex((p) => p.includes(probe)) : -1;
  if (targetIdx < 0) return { content: `${content}\n\n${suggestion}`, appended: true };
  return { content: paras.map((p, i) => (i === targetIdx ? suggestion : p)).join('\n\n'), appended: false };
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
