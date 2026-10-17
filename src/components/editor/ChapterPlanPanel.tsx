import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, UserCog, Check } from 'lucide-react';
import { useNovelStore } from '../../stores/novelStore';
import { findChapter } from '../../stores/chapterOps';
import { summarizeChapter, suggestCardUpdates } from '../../services/storyPlanning';
import { NO_API_KEY_MESSAGE, formatActionError } from '../../services/llmErrors';
import { summaryStatus, type SummaryStatus } from '../../utils/chapterSummary';
import { bookVolumes, buildCardContext, recapThrough } from '../../utils/storyContext';
import { describeCardSuggestion } from '../../utils/cardUpdates';
import type { CardUpdateSuggestion } from '../../types';

const OUTLINE_PLACEHOLDER = '本章要写的事：按顺序写几个节拍，最后一行写「章末：停在哪」。示范初稿和续写会按它写，诊断会检查哪些还没写到。';

const STATUS_CHIPS: Record<SummaryStatus, { label: string; className: string }> = {
  none: { label: '未生成摘要', className: 'text-zinc-500 border-zinc-700' },
  stale: { label: '正文改过，摘要已过期', className: 'text-amber-300 border-amber-500/40' },
  fresh: { label: '摘要已是最新', className: 'text-emerald-400 border-emerald-500/30' },
};

type PanelMessage = { tone: 'error' | 'info'; text: string };

// 正文上方的「细纲与摘要」：本章细纲（AI 写作按它写），本章摘要（后面各章的前情提要），按前情更新设定卡。
// 由 EditorView 以章节 id 作 key 渲染，切换章节即重置；摘要请求不随切换取消，结果写回发起时的章节
export const ChapterPlanPanel: React.FC<{ chapterId: string }> = ({ chapterId }) => {
  const {
    volumes,
    myCharacters,
    myWorldElements,
    apiBaseUrl,
    apiKey,
    modelName,
    setChapterOutline,
    setChapterSummary,
    applyCardSuggestions,
  } = useNovelStore();
  const chapter = findChapter(volumes, chapterId);
  // 还没写正文的章节默认展开，方便先写细纲；写过的默认收起，不占正文位置
  const [open, setOpen] = useState(() => !findChapter(useNovelStore.getState().volumes, chapterId)?.content.trim());
  const [summarizing, setSummarizing] = useState(false);
  const [checkingCards, setCheckingCards] = useState(false);
  const [suggestions, setSuggestions] = useState<CardUpdateSuggestion[] | null>(null);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const cardsAbort = useRef<AbortController | null>(null);
  useEffect(() => () => cardsAbort.current?.abort(), []);

  if (!chapter) return null;
  const config = { baseUrl: apiBaseUrl, apiKey, model: modelName };
  const status = summaryStatus(chapter);
  const chip = STATUS_CHIPS[status];
  const bookChapters = bookVolumes(volumes, chapterId).flatMap((v) => v.chapters);
  const hasSummarySoFar = bookChapters.slice(0, bookChapters.findIndex((c) => c.id === chapterId) + 1).some((c) => c.summary);
  const cards = { characters: myCharacters, worldElements: myWorldElements };
  // 同一张卡可能有几条建议（如状态与身份分开给），列表用建议的序号作 key
  const visibleSuggestions = (suggestions ?? []).flatMap((s, order) => {
    const described = describeCardSuggestion(cards, s);
    return described ? [{ suggestion: s, order, ...described }] : [];
  });

  const handleSummarize = async () => {
    if (!apiKey) return setMessage({ tone: 'error', text: NO_API_KEY_MESSAGE });
    if (!chapter.content.trim()) return setMessage({ tone: 'info', text: '本章还没有正文，写完再生成摘要' });
    setSummarizing(true);
    setMessage(null);
    try {
      const latest = useNovelStore.getState();
      const summary = await summarizeChapter(config, {
        title: chapter.title,
        content: chapter.content,
        storyContext: buildCardContext(latest.myCharacters, latest.myWorldElements),
      });
      setChapterSummary(chapterId, summary);
    } catch (err: any) {
      setMessage({ tone: 'error', text: formatActionError('生成摘要', err.message) });
    } finally {
      setSummarizing(false);
    }
  };

  const handleCheckCards = async () => {
    if (!apiKey) return setMessage({ tone: 'error', text: NO_API_KEY_MESSAGE });
    cardsAbort.current?.abort();
    const controller = new AbortController();
    cardsAbort.current = controller;
    setCheckingCards(true);
    setSuggestions(null);
    setMessage(null);
    try {
      const latest = useNovelStore.getState();
      const list = await suggestCardUpdates(
        config,
        { characters: latest.myCharacters, worldElements: latest.myWorldElements, recap: recapThrough(latest.volumes, chapterId) },
        controller.signal,
      );
      setSuggestions(list);
    } catch (err: any) {
      if (!controller.signal.aborted) setMessage({ tone: 'error', text: formatActionError('检查设定卡', err.message) });
    } finally {
      if (cardsAbort.current === controller) {
        cardsAbort.current = null;
        setCheckingCards(false);
      }
    }
  };

  const handleApplyAll = () => {
    applyCardSuggestions(visibleSuggestions.map((v) => v.suggestion));
    setMessage({ tone: 'info', text: `已更新 ${visibleSuggestions.length} 处设定卡` });
  };

  const outlinePreview = chapter.outline?.trim().split('\n')[0] ?? '';

  return (
    <section aria-label="细纲与摘要" className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left min-w-0"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
        <span className="font-semibold text-zinc-200 shrink-0">细纲与摘要</span>
        <span className={`truncate min-w-0 ${outlinePreview ? 'text-zinc-400' : 'text-zinc-600'}`}>{outlinePreview || '未写细纲'}</span>
        <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded border text-[10px] ${chip.className}`}>{chip.label}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-800/80 pt-3">
          <div>
            <label htmlFor={`outline-${chapterId}`} className="block text-zinc-400 mb-1">本章细纲</label>
            <textarea
              id={`outline-${chapterId}`}
              value={chapter.outline ?? ''}
              onChange={(e) => setChapterOutline(chapterId, e.target.value)}
              rows={4}
              placeholder={OUTLINE_PLACEHOLDER}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/60 rounded-md p-2 text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">本章摘要 <span className="text-zinc-600">（后面各章的前情提要用它）</span></span>
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 whitespace-nowrap disabled:opacity-50"
              >
                {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 text-amber-400" />}
                <span>{chapter.summary ? '重新生成' : '生成摘要'}</span>
              </button>
            </div>
            {chapter.summary ? (
              <div className="rounded-md bg-zinc-950 border border-zinc-800 p-2 space-y-1.5">
                <p className="text-zinc-300 leading-relaxed">{chapter.summary.text}</p>
                {chapter.summary.state_changes.length > 0 && (
                  <ul className="space-y-0.5 text-zinc-400">
                    {chapter.summary.state_changes.map((change, i) => (
                      <li key={i}>· {change}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-zinc-600">写完本章后生成摘要；没有摘要的章节，后面写作时 AI 只看得到章名。</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">设定卡</span>
              <button
                onClick={handleCheckCards}
                disabled={checkingCards || !hasSummarySoFar}
                title={hasSummarySoFar ? '对照到本章为止的前情提要，找出人物卡、设定卡过时或缺失的地方' : '先生成摘要，才知道前情里发生了什么'}
                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkingCards ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCog className="w-3 h-3 text-emerald-400" />}
                <span>按前情更新设定卡</span>
              </button>
            </div>
            {suggestions !== null &&
              (visibleSuggestions.length === 0 ? (
                <p className="text-zinc-500">设定卡已跟上前情，没有要改的。</p>
              ) : (
                <div className="space-y-1.5">
                  {visibleSuggestions.map(({ suggestion, order, title, lines }) => (
                    <div key={order} className="rounded-md bg-zinc-950 border border-zinc-800 p-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-zinc-200 font-medium">{title}</p>
                        {lines.map((line, i) => (
                          <p key={i} className="text-zinc-400 break-words">{line}</p>
                        ))}
                        {suggestion.reason && <p className="text-zinc-600 break-words">依据：{suggestion.reason}</p>}
                      </div>
                      <button
                        onClick={() => applyCardSuggestions([suggestion])}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300"
                      >
                        <Check className="w-3 h-3" />
                        <span>采纳</span>
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setSuggestions(null)} className="px-2 py-1 rounded text-zinc-400 hover:bg-zinc-800">忽略</button>
                    <button onClick={handleApplyAll} className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold">
                      全部采纳 {visibleSuggestions.length}
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {message && (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-rose-300' : 'text-zinc-400'}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
