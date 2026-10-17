import React, { useEffect } from 'react';

// 创作台工具栏下方的页面内提示条，替代阻塞式的 alert()：错误常驻直到关闭，成功 / 提示 5 秒后自动消失
export type EditorNoticeTone = 'error' | 'success' | 'info';

export interface EditorNoticeState {
  tone: EditorNoticeTone;
  text: string;
  action?: { label: string; onClick: () => void }; // 如「撤销」
  durationMs?: number; // 覆盖默认的自动消失时长
}

const AUTO_DISMISS_MS = 5000;
// 带「撤销」的删除提示停留更久，给用户反应时间
export const UNDO_NOTICE_MS = 8000;

const TONE_CLASSES: Record<EditorNoticeTone, string> = {
  error: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  info: 'bg-zinc-900/90 border-zinc-800 text-zinc-300',
};

interface Props {
  notice: EditorNoticeState | null;
  onDismiss: () => void;
}

export const EditorNotice: React.FC<Props> = ({ notice, onDismiss }) => {
  useEffect(() => {
    if (!notice || notice.tone === 'error') return;
    const timer = setTimeout(onDismiss, notice.durationMs ?? AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;

  return (
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className={`px-3 md:px-6 py-2 border-b flex items-center justify-between gap-2 text-[11px] leading-relaxed shrink-0 ${TONE_CLASSES[notice.tone]}`}
    >
      <span>{notice.text}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {notice.action && (
          <button
            onClick={notice.action.onClick}
            className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200"
          >
            {notice.action.label}
          </button>
        )}
        <button onClick={onDismiss} aria-label="关闭提示" className="opacity-70 hover:opacity-100 px-1">
          ✕
        </button>
      </div>
    </div>
  );
};
