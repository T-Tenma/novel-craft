import type { ConsistencyCheckReport, ConsistencyConflict } from '../services/llm';

export const CONFLICT_TYPE_LABELS: Record<ConsistencyConflict['type'], string> = {
  character_conflict: '人设冲突',
  world_rule_breach: '设定违规',
  logic_plot_hole: '逻辑漏洞',
};

// 横幅标题：给出冲突数量；模型判定冲突却没列明细时如实说明，而不是只显示一句笼统结论
export function getConsistencyHeadline(report: Pick<ConsistencyCheckReport, 'is_consistent' | 'conflicts'>): string {
  const count = report.conflicts.length;
  if (report.is_consistent) {
    return count > 0 ? `基本通过，有 ${count} 处提醒` : '设定严密性通过';
  }
  return count > 0 ? `发现 ${count} 处设定冲突` : '发现设定冲突（模型未列出具体位置）';
}
