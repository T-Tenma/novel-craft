import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { ConsistencyCheckReport } from '../../services/llm';
import { CONFLICT_TYPE_LABELS, getConsistencyHeadline } from '../../utils/consistency';

interface ConsistencyReportBannerProps {
  report: ConsistencyCheckReport;
  onClose: () => void;
}

// 防吃设定一致性报告横幅：总评 + 逐条冲突明细（涉及对象、原文节选、违背的设定、修改建议）
export const ConsistencyReportBanner: React.FC<ConsistencyReportBannerProps> = ({ report, onClose }) => {
  const passed = report.is_consistent;
  return (
    <div className={`px-4 py-2.5 border-b text-xs shrink-0 animate-fade-in motion-reduce:animate-none ${
      passed
        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
        : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
    }`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className={`w-4 h-4 shrink-0 ${passed ? 'text-emerald-400' : 'text-rose-400'}`} />
          <span className="font-semibold text-xs">{getConsistencyHeadline(report)}</span>
          <span className="font-mono px-1.5 py-px rounded bg-zinc-900 text-amber-400 text-[10px] shrink-0">
            {report.consistency_score}分
          </span>
        </div>
        <button onClick={onClose} aria-label="关闭一致性报告" className="text-zinc-400 shrink-0">✕</button>
      </div>
      {report.overall_summary && <p className="text-[11px] text-zinc-300">{report.overall_summary}</p>}

      {report.conflicts.length > 0 && (
        <ol className="mt-2 space-y-2 max-h-[25dvh] overflow-y-auto pr-1">
          {report.conflicts.map((c, i) => (
            <li key={i} className="p-2 rounded-md bg-zinc-950/60 border border-zinc-800 space-y-1 text-[11px] text-zinc-300">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 rounded text-[10px] ${passed ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
                  {CONFLICT_TYPE_LABELS[c.type]}
                </span>
                {c.target && <span className="font-semibold text-zinc-100 break-all">{c.target}</span>}
              </div>
              {c.problem_excerpt && <p className="text-zinc-400 break-words">原文：「{c.problem_excerpt}」</p>}
              {c.rule_violated && (
                <p className="break-words"><span className="text-rose-300">违背：</span>{c.rule_violated}</p>
              )}
              {c.suggestion && (
                <p className="break-words"><span className="text-emerald-300">建议：</span>{c.suggestion}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
