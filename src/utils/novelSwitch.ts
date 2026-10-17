// 批量拆解只服务于发起时的那本小说：切到另一本（或移除当前小说，target 为 null）前必须先停止；
// 重新选中正在拆解的同一本不打断
export function mustStopBatchBeforeSwitch(
  isRunning: boolean,
  currentFile: string | undefined,
  targetFile: string | null
): boolean {
  return isRunning && targetFile !== currentFile;
}

// 导入文件（含加载样本）一律停止批量拆解：同名导入会覆盖旧书，拆解中的结果对应的是旧正文
export function mustStopBatchBeforeImport(isRunning: boolean): boolean {
  return isRunning;
}

export const batchStopNotice = (batchFile: string) =>
  `《${batchFile}》正在批量拆解，继续操作会停止拆解（已完成的章节已保存，之后可点「断点续拆剩余」继续）。`;

// 导入前需要用户确认的提示；返回 null 表示可直接导入。
// 同名导入覆盖书库中的旧书并清空它的拆解结果（拆解对应旧正文，留着会与新正文对不上）
export function importConfirmMessage(
  fileName: string,
  opts: { replacesStored: boolean; batchFile: string | null }
): string | null {
  const parts: string[] = [];
  if (opts.replacesStored) {
    parts.push(`书库中已有《${fileName}》，重新导入会用新文件覆盖它的正文，并清空这本书已有的拆解结果。`);
  }
  if (opts.batchFile === fileName) parts.push('正在进行的批量拆解也会停止。');
  else if (opts.batchFile) parts.push(batchStopNotice(opts.batchFile));
  return parts.length > 0 ? `${parts.join('')}确定继续吗？` : null;
}

export type ChapterResultTarget = 'current' | 'storage-only' | 'stale';

// 单章 / 单段拆解结果返回时写到哪里：
// 仍是同一本且该章正文没变 → 显示并保存；已切到别的书 → 只存回原书；
// 同名书已被重新导入且该章正文变了（或已没有这一章）→ 结果已过期，丢弃
export function chapterResultTarget(
  request: { file: string; content: string },
  current: { file: string; content: string | undefined } | null
): ChapterResultTarget {
  if (current?.file !== request.file) return 'storage-only';
  return current.content === request.content ? 'current' : 'stale';
}
