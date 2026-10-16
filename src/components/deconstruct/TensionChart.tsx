import React from 'react';
import { Chapter, ChapterAnalysis } from '../../types';
import { Flame } from 'lucide-react';

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
  if (!chapters || chapters.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-zinc-600 bg-zinc-950/60 rounded-xl border border-zinc-800">
        导入小说后将自动绘制全书情绪张力波形图
      </div>
    );
  }

  const width = 800;
  const height = 130;
  const padding = { top: 25, bottom: 25, left: 35, right: 35 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // 构造点集 (x: 章节位置, y: 张力打分 1-10)
  const points = chapters.map((ch, idx) => {
    const analysis = analyses[ch.id];
    const score = analysis ? analysis.tension_score : 4; // 默认平水线 4
    const isAnalyzed = !!analysis;

    const x =
      chapters.length === 1
        ? padding.left + graphWidth / 2
        : padding.left + (idx / (chapters.length - 1)) * graphWidth;
    
    // y 映射：score 1 -> graphHeight, score 10 -> 0
    const y = padding.top + graphHeight - ((score - 1) / 9) * graphHeight;

    return { x, y, ch, score, isAnalyzed, analysis };
  });

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
      {/* 顶栏信息 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
            全书情节叙事张力曲线 (Narrative Tension Wave)
          </h3>
          <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full font-mono">
            已解析 {analyzedCount} / {chapters.length} 节拍
          </span>
        </div>

        {highestChapter && (
          <div className="flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>峰值高潮: {highestChapter.chapter_title} (★{highestChapter.tension_score})</span>
          </div>
        )}
      </div>

      {/* SVG 曲线绘图区 */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-32 overflow-visible"
          preserveAspectRatio="none"
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

          {/* 参考水平线：高潮阈值线 (8分) */}
          <line
            x1={padding.left}
            y1={padding.top + graphHeight * 0.22}
            x2={width - padding.right}
            y2={padding.top + graphHeight * 0.22}
            stroke="#e11d48"
            strokeDasharray="4 4"
            strokeWidth="1"
            strokeOpacity="0.4"
          />
          <text
            x={padding.left + 5}
            y={padding.top + graphHeight * 0.22 - 4}
            fill="#fb7185"
            fontSize="9"
            className="font-mono"
          >
            高潮/危机临界线 (8分)
          </text>

          {/* 参考水平线：日常/平水线 (4分) */}
          <line
            x1={padding.left}
            y1={padding.top + graphHeight * 0.66}
            x2={width - padding.right}
            y2={padding.top + graphHeight * 0.66}
            stroke="#52525b"
            strokeDasharray="2 4"
            strokeWidth="1"
            strokeOpacity="0.5"
          />
          <text
            x={padding.left + 5}
            y={padding.top + graphHeight * 0.66 - 4}
            fill="#71717a"
            fontSize="9"
            className="font-mono"
          >
            铺垫平水线 (4分)
          </text>

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
                        ? 'fill-rose-500 group-hover:r-7 group-hover:fill-rose-400'
                        : 'fill-amber-500 group-hover:r-7 group-hover:fill-amber-300'
                      : 'fill-zinc-700 stroke-1 stroke-zinc-600'
                  }`}
                />

                {/* 章节序号或分数标记 */}
                {p.isAnalyzed && (
                  <text
                    x={p.x}
                    y={p.y - 8}
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

      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
        <span>💡 提示：点击曲线上任意节点，可快速跳转到对应章节阅读与深度拆解。</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> 强冲突高潮 (≥8)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 发展推进</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-700 inline-block" /> 待分析</span>
        </span>
      </div>
    </div>
  );
};
