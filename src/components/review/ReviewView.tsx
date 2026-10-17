import React, { useState } from 'react';
import { useNovelStore } from '../../stores/novelStore';
import { reviewDraftWithLLM } from '../../services/llm';
import { getReviewGrade, formatRadarScore } from '../../utils/reviewGrade';
import { getChapterReview } from '../../utils/chapterReview';
import { copyText } from '../../utils/clipboard';
import { chapterTitleOrDefault } from '../../stores/chapterOps';
import { NO_API_KEY_MESSAGE, formatActionError } from '../../services/llmErrors';
import { buildReviewContext } from '../../utils/storyContext';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb, 
  Play, 
  ShieldCheck, 
  Check, 
  Copy,
  BookOpen,
  Sliders,
  FileCheck,
  Loader2
} from 'lucide-react';

export const ReviewView: React.FC = () => {
  const { 
    draftTitle, 
    draftContent, 
    reviewReports, 
    setChapterReview, 
    isReviewing, 
    setIsReviewing,
    volumes,
    activeChapterId,
    setActiveChapterId,
    myCharacters,
    myWorldElements,
    apiBaseUrl, 
    apiKey, 
    modelName 
  } = useNovelStore();

  const [errorMsg, setErrorMsg] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  const chapterReview = getChapterReview(reviewReports, activeChapterId, draftContent);
  const reviewReport = chapterReview?.report ?? null;
  const reviewGrade = reviewReport ? getReviewGrade(reviewReport.score_overall) : null;
  // 🌟 手机端视图切换: 'config' (章节选择与触发) | 'report' (诊断评估报告) 🌟
  const [mobileTab, setMobileTab] = useState<'config' | 'report'>('config');

  // 扁平化所有章节，供下拉选择快速切换送审章节
  const allChapters = volumes.flatMap(v => v.chapters.map(c => ({ ...c, volumeTitle: v.title })));

  const handleStartReview = async () => {
    if (!draftContent.trim()) {
      setErrorMsg('所选章节还没有正文，请先在仿写创作台写一些内容再送审');
      return;
    }
    if (!apiKey) {
      setErrorMsg(NO_API_KEY_MESSAGE);
      return;
    }

    // 报告写回发起审稿时的章节：等待期间切到其他章节，也不会把结论记到别的章节上
    const chapterId = activeChapterId;
    const reviewedContent = draftContent;
    setIsReviewing(true);
    setErrorMsg('');
    try {
      // 携带当前维护的角色动机与世界观背景作为评审基准；到本章还没出现的设定会标明，免得早先的章节被要求写后文的设定
      const contextHint = buildReviewContext({ volumes, chapterId, characters: myCharacters, worldElements: myWorldElements });
      const report = await reviewDraftWithLLM(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftTitle,
        draftContent,
        contextHint
      );
      setChapterReview(chapterId, { report, reviewedContent });
      if (window.innerWidth < 768) {
        setMobileTab('report');
      }
    } catch (err: any) {
      setErrorMsg(formatActionError('AI 审稿', err.message));
    } finally {
      setIsReviewing(false);
    }
  };

  // 导出完整的审稿报告与改稿批注
  const handleExportFullReview = async () => {
    if (!reviewReport) return;
    let md = `# 📋 《${draftTitle || '未命名章节'}》AI 商业专家审稿与诊断报告\n\n`;
    const grade = getReviewGrade(reviewReport.score_overall);
    md += `> 综合评分：${reviewReport.score_overall} / 100 分  | 判定等级：${grade.tier} 级 · ${grade.headline}\n\n`;
    
    md += `## 📊 商业潜质五维拆解\n`;
    md += `- **黄金开篇钩子强度**：${formatRadarScore(reviewReport.radar.hook_strength)}\n`;
    md += `- **剧情推进与张力密度**：${formatRadarScore(reviewReport.radar.pacing_tension)}\n`;
    md += `- **主角人设辨识度与动机**：${formatRadarScore(reviewReport.radar.character_arc)}\n`;
    md += `- **悬念留白与追读欲望**：${formatRadarScore(reviewReport.radar.curiosity_gap)}\n`;
    md += `- **设定新鲜度与毒点规避**：${formatRadarScore(reviewReport.radar.trope_freshness)}\n\n`;

    md += `## 🌟 亮眼优势 (Pros)\n`;
    reviewReport.pros.forEach(p => md += `- ${p}\n`);
    md += `\n`;

    md += `## ⚠️ 致命毒点与拖沓警示 (Cons)\n`;
    reviewReport.cons.forEach(c => md += `- ${c}\n`);
    md += `\n`;

    md += `## 💡 金牌主编精修与改稿建议\n`;
    reviewReport.revision_suggestions.forEach(s => md += `1. ${s}\n`);
    md += `\n---\n*由 NovelCraft 审稿评估室自动生成*`;

    const ok = await copyText(md);
    setCopyState(ok ? 'done' : 'failed');
    setTimeout(() => setCopyState('idle'), ok ? 2000 : 4000);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-zinc-950 text-zinc-100 pb-mobile-nav md:pb-0">
      {/* 🌟 手机端顶部分段切换器 🌟 */}
      <div className="md:hidden flex items-center justify-around bg-zinc-900 border-b border-zinc-800 p-1.5 shrink-0 z-20">
        <button
          onClick={() => setMobileTab('config')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            mobileTab === 'config' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>送审设置</span>
        </button>

        <button
          onClick={() => setMobileTab('report')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            mobileTab === 'report' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>诊断报告 {reviewReport ? `(${reviewReport.score_overall}分)` : ''}</span>
        </button>
      </div>

      {/* 1. 左侧待审章节选择与触发控制 (手机端受 mobileTab 控制，桌面端固定展示) */}
      <aside className={`w-full md:w-80 border-r border-zinc-800 bg-zinc-900/30 flex-col shrink-0 p-4 space-y-4 overflow-y-auto ${
        mobileTab === 'config' ? 'flex' : 'hidden md:flex'
      }`}>
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-zinc-200">待审稿件选择</h3>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            {draftContent.replace(/\s+/g, '').length} 字
          </span>
        </div>

        {/* 快速选择小说目录树中的章节 */}
        <div>
          <label htmlFor="review-chapter-select" className="block text-[11px] text-zinc-400 mb-1">选择送审章节</label>
          <select
            id="review-chapter-select"
            value={activeChapterId}
            onChange={(e) => setActiveChapterId(e.target.value)}
            disabled={isReviewing}
            className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          >
            {allChapters.map(ch => (
              <option key={ch.id} value={ch.id}>
                {ch.volumeTitle} · {chapterTitleOrDefault(ch.title)} ({ch.word_count}字)
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleStartReview}
          disabled={isReviewing}
          className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10 disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-zinc-950" />
          <span>{isReviewing ? 'AI 专家团队多维盲审中...' : '开始 AI 商业审稿'}</span>
        </button>

        {/* 错误紧跟在触发按钮下方：手机端报告面板默认隐藏，放在那里用户看不到 */}
        {errorMsg && (
          <div role="alert" className="p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {reviewReport && (
          <button
            onClick={handleExportFullReview}
            className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            {copyState === 'done' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span aria-live="polite" className={copyState === 'failed' ? 'text-rose-300' : undefined}>
              {copyState === 'done' ? '已复制整篇诊断报告' : copyState === 'failed' ? '复制失败，请手动选中复制' : '一键导出审稿报告'}
            </span>
          </button>
        )}

        <div className="text-[11px] text-zinc-500 leading-relaxed p-2 bg-zinc-900/50 rounded-lg border border-zinc-800/80">
          💡 <strong>商业化评审标准</strong>：
          对标起终点、晋江等千万级爆款网文黄金法则，深度结合你维护的【新书人设动机】与【世界观规则】，从开篇抓人度、翻页欲望与毒点规避严格盲审。
        </div>
      </aside>

      {/* 2. 中间审稿诊断报告 (手机端受 mobileTab 控制，桌面端直接填充) */}
      <main className={`flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-950 ${
        mobileTab === 'report' ? 'block' : 'hidden md:block'
      }`}>
        {isReviewing ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs space-y-3" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            <p className="font-semibold text-zinc-300">AI 专家团队正在多维盲审本章…</p>
            <p className="text-zinc-500">通常需要 20–40 秒，完成后报告会显示在这里</p>
          </div>
        ) : reviewReport ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {chapterReview?.isStale && (
              <div role="status" className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                审稿后本章正文有改动，以下报告基于改动前的稿件，建议重新审稿
              </div>
            )}

            {/* 综合得分横幅 */}
            <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-r from-zinc-900 via-amber-950/20 to-zinc-900 border border-amber-500/20 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-xs text-amber-400 font-mono tracking-widest uppercase">
                  AI 商业终审综合评级
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1">
                  {reviewGrade?.headline}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {reviewGrade?.summary}
                </p>
              </div>

              <div className="w-20 h-20 shrink-0 rounded-full bg-zinc-950 border-2 border-amber-500 flex flex-col items-center justify-center shadow-lg shadow-amber-500/20">
                <span className="text-2xl font-black text-amber-400 font-mono leading-none">
                  {reviewReport.score_overall}
                </span>
                <span className="text-[10px] text-zinc-500 mt-1 font-mono whitespace-nowrap">/ 100 分</span>
              </div>
            </div>

            {/* 五维雷达柱状打分条 */}
            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-200">商业潜质五维拆解</h3>
              <div className="space-y-2.5 text-xs">
                {[
                  { key: 'hook_strength', label: '黄金开篇钩子强度 (前300字抓眼球)', score: reviewReport.radar.hook_strength },
                  { key: 'pacing_tension', label: '剧情推进与张力密度 (无拖沓灌水)', score: reviewReport.radar.pacing_tension },
                  { key: 'curiosity_gap', label: '悬念留白与让读者翻下一页欲望', score: reviewReport.radar.curiosity_gap },
                  { key: 'trope_freshness', label: '设定新鲜度与毒点规避', score: reviewReport.radar.trope_freshness },
                  { key: 'character_arc', label: '主角动机与人设辨识度', score: reviewReport.radar.character_arc },
                ].map((item) => (
                  <div key={item.key}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-zinc-300">{item.label}</span>
                      <span className={`font-mono font-bold ${item.score === null ? 'text-zinc-500' : 'text-amber-400'}`}>
                        {formatRadarScore(item.score)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                      <div
                        className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: `${item.score ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 亮点优势 */}
            <div className="p-5 rounded-xl bg-zinc-900 border border-emerald-500/20 space-y-2">
              <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>亮眼优势 (Pros)</span>
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {reviewReport.pros.map((pro, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-500 font-bold shrink-0">•</span>
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 毒点硬伤警示 */}
            <div className="p-5 rounded-xl bg-zinc-900 border border-rose-500/20 space-y-2">
              <h3 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>拖沓/毒点警示 (Cons)</span>
              </h3>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {reviewReport.cons.map((con, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-rose-500 font-bold shrink-0">•</span>
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 主编改稿精修建议 */}
            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <h3 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>主编改稿建议 (Actionable Revision)</span>
              </h3>
              <ul className="space-y-2 text-xs text-zinc-300">
                {reviewReport.revision_suggestions.map((sug, idx) => (
                  <li key={idx} className="p-2.5 rounded bg-zinc-950 border border-zinc-800/80 leading-relaxed">
                    👉 {sug}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs space-y-2">
            <ShieldCheck className="w-10 h-10 opacity-30 text-amber-400" />
            <p>本章尚未审稿，点击左侧「开始 AI 商业审稿」对当前写作稿件进行验收评估</p>
          </div>
        )}
      </main>
    </div>
  );
};
