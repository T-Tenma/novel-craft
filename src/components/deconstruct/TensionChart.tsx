import React, { useEffect, useRef, useState } from 'react';
import { Chapter, ChapterAnalysis } from '../../types';
import { Flame, ChevronDown, ChevronUp } from 'lucide-react';

// 画布按容器实际像素宽度绘制（不拉伸），文字和节点不会被压扁
const CHART_HEIGHT = 128;
const FALLBACK_WIDTH = 800;
const PADDING = { top: 22, bottom: 18, left: 52, right: 20 };
// 手机上曲线约占 260px 高、会把正文挤到首屏以下，默认收起；桌面端默认展开
const COLLAPSE_BY_DEFAULT_QUERY = '(max-width: 767px)';
// 节点可点区域半径：直径 36px 便于触控；章节很密时收缩到相邻间距的一半，最小 6px
const MAX_HIT_RADIUS = 18;
const MIN_HIT_RADIUS = 6;
const REFERENCE_LINES = [
  { score: 8, label: '高潮 8', stroke: '#e11d48', textColor: '#fb7185', dash: '4 4', opacity: 0.4 },
  { score: 4, label: '平水 4', stroke: '#52525b', textColor: '#71717a', dash: '2 4', opacity: 0.5 },
];

interface TensionChartProps {
  chapters: Chapter[];
  analyses: Record<number, ChapterAnalysis>;
  selectedChapterId: number | null;
  onSelectChapter: (id: number) => void;
}

export const TensionChart: React.FC<TensionChartProps> = ({
  chapters,
  analyses,
  selectedChapterId,
  onSelectChapter,
}) => {
  const hasChapters = !!chapters && chapters.length > 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COLLAPSE_BY_DEFAULT_QUERY).matches
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(Math.floor(entry.contentRect.width), 1)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasChapters, collapsed]);

  if (!hasChapters) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-zinc-600 bg-zinc-950/60 rounded-xl border border-zinc-800">
        导入小说后将自动绘制全书情绪张力波形图
      </div>
    );
  }

  const height = CHART_HEIGHT;
  const padding = PADDING;
  const graphWidth = Math.max(width - padding.left - padding.right, 1);
  const graphHeight = height - padding.top - padding.bottom;
  // y 映射：score 1 -> 底部, score 10 -> 顶部
  const scoreToY = (score: number) => padding.top + graphHeight - ((score - 1) / 9) * graphHeight;

  // 构造点集 (x: 章节位置, y: 张力打分 1-10)
  const points = chapters.map((ch, idx) => {
    const analysis = analyses[ch.id];
    const score = analysis ? analysis.tension_score : 4; // 默认平水线 4
    const isAnalyzed = !!analysis;

    const x =
      chapters.length === 1
        ? padding.left + graphWidth / 2
        : padding.left + (idx / (chapters.length - 1)) * graphWidth;
    const y = scoreToY(score);

    return { x, y, ch, score, isAnalyzed, analysis };
  });

  const pointSpacing = chapters.length > 1 ? graphWidth / (chapters.length - 1) : graphWidth;
  const hitRadius = Math.min(MAX_HIT_RADIUS, Math.max(pointSpacing / 2, MIN_HIT_RADIUS));

  // 生成平滑贝塞尔曲线或折线路径
  const pathD = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = arr[i - 1];
    const cp1x = prev.x + (p.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (p.x - prev.x) / 2;
    const cp2y = p.y;
    return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p.x} ${p.y}`;
  }, '');

  // 渐变填充闭合路径
  const firstP = points[0];
  const lastP = points[points.length - 1];
  const baselineY = padding.top + graphHeight;
  const areaD = `${pathD} L ${lastP.x} ${baselineY} L ${firstP.x} ${baselineY} Z`;

  // 统计已拆解数量与最高张力
  const analyzedCount = Object.keys(analyses).length;
  const highestChapter = Object.values(analyses).sort((a, b) => b.tension_score - a.tension_score)[0];

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 shadow-lg space-y-2 select-none">
      {/* 顶栏信息：窄屏时换行而不是把标签挤成两行 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <h3 className="text-xs font-semibold text-zinc-100 whitespace-nowrap">
            全书情节叙事张力曲线<span className="hidden 2xl:inline"> (Narrative Tension Wave)</span>
          </h3>
          <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full font-mono whitespace-nowrap">
            已解析 {analyzedCount} / {chapters.length} 节拍
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0 max-w-full ml-auto">
          {highestChapter && (
            <div className="flex items-center gap-1 min-w-0 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
              <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">峰值高潮: {highestChapter.chapter_title} (★{highestChapter.tension_score})</span>
            </div>
          )}
          {/* 手机上只显示箭头（文字放进 aria-label），让收起后的顶栏保持一行 */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展开张力曲线' : '收起张力曲线'}
            title={collapsed ? '展开张力曲线' : '收起张力曲线'}
            className="flex items-center gap-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{collapsed ? '展开曲线' : '收起'}</span>
          </button>
        </div>
      </div>

      {!collapsed && (
      <>

      {/* SVG 曲线绘图区 */}
      <div ref={containerRef} className="relative w-full overflow-hidden">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
        >
          <defs>
            <linearGradient id="tensionAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#d97706" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="tensionLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>

          {/* 参考水平线：高潮阈值 (8分) / 铺垫平水 (4分)，刻度文字放在左侧留白，不与节点重叠 */}
          {REFERENCE_LINES.map((ref) => (
            <g key={ref.score}>
              <line
                x1={padding.left}
                y1={scoreToY(ref.score)}
                x2={width - padding.right}
                y2={scoreToY(ref.score)}
                stroke={ref.stroke}
                strokeDasharray={ref.dash}
                strokeWidth="1"
                strokeOpacity={ref.opacity}
              />
              <text
                x={padding.left - 12}
                y={scoreToY(ref.score) + 3}
                textAnchor="end"
                fill={ref.textColor}
                fontSize="10"
                className="font-mono"
              >
                {ref.label}
              </text>
            </g>
          ))}

          {/* 填充阴影面积 */}
          {points.length > 1 && (
            <path d={areaD} fill="url(#tensionAreaGrad)" />
          )}

          {/* 主平滑折线 */}
          {points.length > 1 && (
            <path
              d={pathD}
              fill="none"
              stroke="url(#tensionLineGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* 数据关键节点交互圆圈 */}
          {points.map((p) => {
            const isSelected = p.ch.id === selectedChapterId;
            const isHighTension = p.score >= 8;

            return (
              <g
                key={p.ch.id}
                onClick={() => onSelectChapter(p.ch.id)}
                className="cursor-pointer group"
              >
                {/* 透明的可点区域，比可见圆点大，手机上也点得中 */}
                <circle cx={p.x} cy={p.y} r={hitRadius} fill="transparent" />

                {/* 悬停光晕 */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 8 : 5}
                  className={`transition-all duration-200 ${
                    isSelected
                      ? 'fill-amber-400 stroke-4 stroke-amber-500/40'
                      : p.isAnalyzed
                      ? isHighTension
                        ? 'fill-rose-500 group-hover:[r:7] group-hover:fill-rose-400'
                        : 'fill-amber-500 group-hover:[r:7] group-hover:fill-amber-300'
                      : 'fill-zinc-700 stroke-1 stroke-zinc-600'
                  }`}
                />

                {/* 章节序号或分数标记 */}
                {p.isAnalyzed && (
                  <text
                    x={p.x}
                    y={p.y - (isSelected ? 12 : 9)}
                    textAnchor="middle"
                    fill={isHighTension ? '#fb7185' : '#fde68a'}
                    fontSize="9"
                    fontWeight="bold"
                    className="font-mono"
                  >
                    {p.score}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
        <span>💡 提示：点击曲线上任意节点，可快速跳转到对应章节阅读与深度拆解。</span>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> 强冲突高潮 (≥8)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 发展推进</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-700 inline-block" /> 待分析</span>
        </span>
      </div>
      </>
      )}
    </div>
  );
};
