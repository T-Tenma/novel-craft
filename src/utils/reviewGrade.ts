// 审稿综合评级：按分数段给出结论，避免低分稿件也被描述成「具有出版潜力」。
// ≥80 沿用原有的 S 级标准与文案；总结只描述分档含义，不臆断稿件的具体优点。

export interface ReviewGrade {
  tier: 'S' | 'A' | 'B' | 'C';
  headline: string;
  summary: string;
}

const GRADE_BANDS: Array<{ min: number; grade: ReviewGrade }> = [
  {
    min: 80,
    grade: {
      tier: 'S',
      headline: '👑 达到 S 级商业连载标准',
      summary: '开篇抓力与节奏已达上架水准，可按下方建议做细节打磨',
    },
  },
  {
    min: 70,
    grade: {
      tier: 'A',
      headline: '📈 具有出版/连载潜力，需精修微调',
      summary: '整体可读性不错，按下方毒点与改稿建议精修后会更有竞争力',
    },
  },
  {
    min: 60,
    grade: {
      tier: 'B',
      headline: '⚠️ 基础尚可，但存在明显短板',
      summary: '下方列出的问题会明显影响追读，建议优先重点修改',
    },
  },
  {
    min: 0,
    grade: {
      tier: 'C',
      headline: '🔧 问题较多，建议重写开篇',
      summary: '当前稿件与商业标准差距较大，建议先解决下方的致命问题再继续',
    },
  },
];

export function getReviewGrade(score: number): ReviewGrade {
  return (GRADE_BANDS.find((band) => score >= band.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]).grade;
}

// 五维单项分数的显示文案：模型漏给的维度显示「未评」
export function formatRadarScore(score: number | null): string {
  return score === null ? '未评' : `${score} / 100`;
}
