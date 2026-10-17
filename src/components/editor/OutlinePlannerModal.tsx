import React, { useEffect, useRef, useState } from 'react';
import { ListTree, Loader2, Trash2, X } from 'lucide-react';
import { useNovelStore } from '../../stores/novelStore';
import { chapterTitleOrDefault, findChapter } from '../../stores/chapterOps';
import { findSelectedIdea } from '../../stores/ideaOps';
import { planChapters, summarizeChapter } from '../../services/storyPlanning';
import { NO_API_KEY_MESSAGE, formatActionError } from '../../services/llmErrors';
import { buildPlanContext, describeIdea, matchChapterNumbering, planScope } from '../../utils/chapterPlan';
import { chaptersNeedingSummary } from '../../utils/chapterSummary';
import { buildCardContext } from '../../utils/storyContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { ChapterPlan } from '../../types';

const COUNT_OPTIONS = [3, 5, 8, 10];
const DEFAULT_COUNT = 5;

interface Props {
  volumeId: string;
  onClose: () => void;
  onApplied: (count: number, firstTitle: string) => void;
}

// AI 拆细纲：按全书大纲（选中的脑洞）、本卷大纲与前情提要，拆出接下来几章的细纲；作者改完后填进本卷还没写的章节，不够再新建
export const OutlinePlannerModal: React.FC<Props> = ({ volumeId, onClose, onApplied }) => {
  const {
    volumes,
    myCharacters,
    myWorldElements,
    ideas,
    selectedIdeaId,
    apiBaseUrl,
    apiKey,
    modelName,
    updateVolume,
    setChapterSummary,
    applyChapterPlans,
  } = useNovelStore();
  const volume = volumes.find((v) => v.id === volumeId);
  const [volumeOutline, setVolumeOutline] = useState(volume?.description ?? '');
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [direction, setDirection] = useState('');
  const [plans, setPlans] = useState<ChapterPlan[] | null>(null);
  const [busy, setBusy] = useState<'plan' | 'summaries' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!volume) return null;
  const config = { baseUrl: apiBaseUrl, apiKey, model: modelName };
  const scope = planScope(volumes, volumeId);
  const missing = chaptersNeedingSummary(scope.earlier);
  const idea = findSelectedIdea(ideas, selectedIdeaId);
  const plannedSlots = scope.slots.filter((c) => c.outline);

  // 卷大纲改动写回本卷简介（编辑分卷里看到的也是它）
  const saveVolumeOutline = () => {
    const latest = useNovelStore.getState().volumes.find((v) => v.id === volumeId);
    if (latest && latest.description !== volumeOutline.trim()) updateVolume(volumeId, latest.title, volumeOutline.trim());
  };

  const startTask = (kind: 'plan' | 'summaries') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(kind);
    setError('');
    return controller;
  };
  const finishTask = (controller: AbortController) => {
    if (abortRef.current !== controller) return;
    abortRef.current = null;
    setBusy(null);
    setProgress('');
  };

  const handleFillSummaries = async () => {
    if (!apiKey) return setError(NO_API_KEY_MESSAGE);
    const controller = startTask('summaries');
    let done = 0;
    try {
      for (const target of missing) {
        setProgress(`正在生成摘要 ${done + 1}/${missing.length}：${chapterTitleOrDefault(target.title)}`);
        const latest = useNovelStore.getState();
        const chapter = findChapter(latest.volumes, target.id);
        if (!chapter?.content.trim()) continue;
        const summary = await summarizeChapter(
          config,
          { title: chapter.title, content: chapter.content, storyContext: buildCardContext(latest.myCharacters, latest.myWorldElements) },
          controller.signal,
        );
        setChapterSummary(chapter.id, summary);
        done += 1;
      }
    } catch (err: any) {
      if (!controller.signal.aborted) setError(`${formatActionError('补齐摘要', err.message)}${done > 0 ? `（已完成 ${done} 章）` : ''}`);
    } finally {
      finishTask(controller);
    }
  };

  const handlePlan = async () => {
    if (!apiKey) return setError(NO_API_KEY_MESSAGE);
    saveVolumeOutline();
    const controller = startTask('plan');
    try {
      const result = await planChapters(
        config,
        {
          count,
          startNumber: scope.startNumber,
          bookOutline: describeIdea(idea),
          volumeOutline,
          storyContext: buildPlanContext(scope, myCharacters, myWorldElements),
          existingOutlines: plannedSlots.map((c) => `${chapterTitleOrDefault(c.title)}：${c.outline?.trim()}`),
          direction,
        },
        controller.signal,
      );
      setPlans(matchChapterNumbering(result, scope.earlier));
    } catch (err: any) {
      if (!controller.signal.aborted) setError(formatActionError('拆细纲', err.message));
    } finally {
      finishTask(controller);
    }
  };

  const updatePlan = (index: number, patch: Partial<ChapterPlan>) =>
    setPlans((list) => list?.map((p, i) => (i === index ? { ...p, ...patch } : p)) ?? null);

  const handleApply = () => {
    // 清空了章名的用默认编号，同样跟随本书的编号写法
    const kept = matchChapterNumbering(
      (plans ?? [])
        .filter((p) => p.outline.trim())
        .map((p, i) => ({ title: p.title.trim() || `第 ${scope.startNumber + i} 章`, outline: p.outline.trim() })),
      scope.earlier,
    );
    if (kept.length === 0) return setError('细纲都是空的，先写上内容或重新生成');
    const replaced = scope.slots.slice(0, kept.length).filter((c) => c.outline);
    if (replaced.length > 0 && !confirm(`${replaced.map((c) => `「${chapterTitleOrDefault(c.title)}」`).join('')}原有的细纲会被替换，继续吗？`)) return;
    saveVolumeOutline();
    if (applyChapterPlans(volumeId, kept)) onApplied(kept.length, kept[0].title);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outline-planner-title"
        tabIndex={-1}
        className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[85dvh] overflow-y-auto text-xs focus:outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id="outline-planner-title" className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5 min-w-0">
            <ListTree className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">AI 拆细纲 · {volume.title}</span>
          </h3>
          <button onClick={onClose} aria-label="关闭拆细纲" className="p-1 text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-zinc-400">
            全书大纲：{idea ? <span className="text-zinc-200">《{idea.title}》（脑洞库里选中的大纲）</span> : <span className="text-zinc-500">没有选中脑洞，只按本卷大纲与前情拆</span>}
          </p>
          <label htmlFor="planner-volume-outline" className="block text-zinc-400">本卷大纲 <span className="text-zinc-600">（改动会存回本卷简介）</span></label>
          <textarea
            id="planner-volume-outline"
            rows={3}
            value={volumeOutline}
            onChange={(e) => setVolumeOutline(e.target.value)}
            onBlur={saveVolumeOutline}
            placeholder="这一卷的主线与高潮目标；写偏了可以在这里改，再按新的方向拆"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/60 rounded-md p-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-y"
          />
        </div>

        <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 space-y-1.5 text-zinc-400">
          <p>
            这本书前面已有 {scope.earlier.length} 章，新细纲从<span className="text-zinc-200">第 {scope.startNumber} 章</span>开始。
            {scope.slots.length > 0 && `本卷后面还没写的 ${scope.slots.length} 章会依次换成新细纲${plannedSlots.length > 0 ? `（其中 ${plannedSlots.length} 章原有细纲）` : ''}，多出来的新建章节。`}
          </p>
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-amber-300/90">
                {missing.length} 章没有摘要或摘要已过期，拆细纲时只看得到它们的章名。
              </span>
              {busy === 'summaries' ? (
                <button onClick={() => abortRef.current?.abort()} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">停止</button>
              ) : (
                <button onClick={handleFillSummaries} disabled={busy !== null} className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold disabled:opacity-50">
                  补齐摘要
                </button>
              )}
            </div>
          )}
          {progress && (
            <p role="status" className="flex items-center gap-1.5 text-amber-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{progress}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="planner-count" className="text-zinc-400">拆</label>
          <select
            id="planner-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} 章</option>
            ))}
          </select>
          <input
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            maxLength={200}
            aria-label="接下来的走向"
            placeholder="接下来的走向（可选）：例如「先收掉沈家支线，再进城」"
            className="flex-1 min-w-[12rem] bg-zinc-950 border border-zinc-800 focus:border-amber-500/60 rounded-md px-2.5 py-1.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        {plans && (
          <div className="space-y-2">
            {plans.map((plan, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    value={plan.title}
                    onChange={(e) => updatePlan(i, { title: e.target.value })}
                    aria-label={`第 ${i + 1} 条细纲的章名`}
                    className="flex-1 min-w-0 bg-transparent border-b border-zinc-800 focus:border-amber-500/60 py-0.5 text-zinc-100 font-semibold focus:outline-none"
                  />
                  <button
                    onClick={() => setPlans((list) => list?.filter((_, j) => j !== i) ?? null)}
                    aria-label={`删除「${plan.title}」`}
                    className="p-1 text-zinc-600 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={plan.outline}
                  onChange={(e) => updatePlan(i, { outline: e.target.value })}
                  rows={4}
                  aria-label={`「${plan.title}」的细纲`}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 rounded-md p-2 text-zinc-300 leading-relaxed focus:outline-none resize-y"
                />
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-rose-300">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-zinc-400 hover:bg-zinc-800">取消</button>
          <button
            onClick={handlePlan}
            disabled={busy !== null}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 disabled:opacity-50"
          >
            {busy === 'plan' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{busy === 'plan' ? '正在拆细纲…' : plans ? '重新生成' : '生成细纲'}</span>
          </button>
          {plans && plans.length > 0 && (
            <button
              onClick={handleApply}
              disabled={busy !== null}
              className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold disabled:opacity-50"
            >
              写入 {plans.length} 章细纲
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
