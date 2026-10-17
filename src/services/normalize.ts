// 大模型 JSON 结果的结构校验：缺字段补安全默认值，关键字段缺失时返回 null 由调用方报错重试，
// 不编造分数等关键信息。渲染层可以假定这里返回的结构完整。
import type { BrainwaveIdea, ChapterAnalysis, CharacterItem, DraftParagraphCritique, ParagraphAnalysis, ReviewReport, WorldElement } from '../types';
import type { ConsistencyCheckReport, ConsistencyConflict, RealtimeDiagnosis } from './llm';

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const textList = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

function toScore(v: unknown, max = 100): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : null;
}

export function normalizeBrainwaveIdea(raw: unknown, fallbackId: string): BrainwaveIdea | null {
  if (!isObject(raw)) return null;
  const beats = isObject(raw.three_act_beats) ? raw.three_act_beats : {};
  const idea: BrainwaveIdea = {
    id: text(raw.id) || fallbackId,
    title: text(raw.title),
    genre: text(raw.genre),
    source_skeleton: text(raw.source_skeleton),
    golden_finger: text(raw.golden_finger),
    main_conflict: text(raw.main_conflict),
    three_act_beats: { act1: text(beats.act1), act2: text(beats.act2), act3: text(beats.act3) },
  };
  const hasContent = idea.title || idea.golden_finger || idea.main_conflict;
  return hasContent ? idea : null;
}

const RADAR_KEYS = ['hook_strength', 'pacing_tension', 'character_arc', 'curiosity_gap', 'trope_freshness'] as const;

export function normalizeReviewReport(raw: unknown): ReviewReport | null {
  if (!isObject(raw) || !isObject(raw.radar)) return null;
  const overall = toScore(raw.score_overall);
  if (overall === null) return null;
  const radarSource = raw.radar;
  const radar = Object.fromEntries(RADAR_KEYS.map((k) => [k, toScore(radarSource[k])])) as ReviewReport['radar'];
  return {
    score_overall: overall,
    radar,
    pros: textList(raw.pros),
    cons: textList(raw.cons),
    revision_suggestions: textList(raw.revision_suggestions),
  };
}

const CRITIQUE_GRADES: DraftParagraphCritique['grade'][] = ['优秀·黄金段', '合格·推进平稳', '硬伤·拖沓灌水', '出戏·人设矛盾'];
const DEFAULT_GRADE: DraftParagraphCritique['grade'] = '合格·推进平稳';

// 模型常写成「硬伤：拖沓」等变体，按关键字（· 前半部分）归到已知等级
function toGrade(v: unknown): DraftParagraphCritique['grade'] {
  const raw = text(v);
  return CRITIQUE_GRADES.find((g) => raw.includes(g.split('·')[0])) ?? DEFAULT_GRADE;
}

const PACING_STATUSES: RealtimeDiagnosis['pacing_status'][] = ['节奏紧凑', '略有拖沓/说明过多', '冲突过激'];

export function normalizeDiagnosis(raw: unknown): RealtimeDiagnosis | null {
  if (!isObject(raw)) return null;
  const match = toScore(raw.match_score);
  const tension = toScore(raw.tension_score, 10);
  if (match === null || tension === null) return null;
  const pacing = text(raw.pacing_status);
  return {
    match_score: match,
    tension_score: tension,
    hook_detected: raw.hook_detected === true,
    // 界面不展示节奏状态；类型要求取值在枚举内
    pacing_status: PACING_STATUSES.find((p) => p === pacing) ?? '节奏紧凑',
    instant_feedback: text(raw.instant_feedback),
  };
}

const CONFLICT_TYPES: ConsistencyConflict['type'][] = ['character_conflict', 'world_rule_breach', 'logic_plot_hole'];

export function normalizeConsistencyReport(raw: unknown): ConsistencyCheckReport | null {
  if (!isObject(raw)) return null;
  const score = toScore(raw.consistency_score);
  if (score === null) return null;
  const conflicts = (Array.isArray(raw.conflicts) ? raw.conflicts : [])
    .filter(isObject)
    .map((c) => ({
      type: CONFLICT_TYPES.find((t) => t === text(c.type)) ?? 'logic_plot_hole',
      target: text(c.target),
      problem_excerpt: text(c.problem_excerpt),
      rule_violated: text(c.rule_violated),
      suggestion: text(c.suggestion),
    }))
    .filter((c) => c.problem_excerpt || c.rule_violated);
  return {
    is_consistent: typeof raw.is_consistent === 'boolean' ? raw.is_consistent : conflicts.length === 0,
    consistency_score: score,
    conflicts,
    overall_summary: text(raw.overall_summary),
  };
}

const ROLE_TYPES: ParagraphAnalysis['role_type'][] = [
  '悬念铺设', '环境氛围', '人物动作', '对白交锋', '心理生理', '世界观渗透', '危机转折', '黄金断章',
];

// 段落类型只是标签，未知值归到「人物动作」；点评 / 作用必须来自模型，否则视为无效
export function normalizeParagraphAnalysis(raw: unknown, paragraphText: string): ParagraphAnalysis | null {
  if (!isObject(raw)) return null;
  const editor_comment = text(raw.editor_comment);
  const purpose = text(raw.purpose);
  if (!editor_comment && !purpose) return null;
  const role = text(raw.role_type);
  return {
    index: 0,
    paragraph_excerpt: paragraphText.slice(0, 30),
    role_type: ROLE_TYPES.find((r) => role.includes(r)) ?? '人物动作',
    technique: text(raw.technique),
    purpose,
    psychological_effect: text(raw.psychological_effect),
    editor_comment,
  };
}

// 模型常照抄示例在改写前加「改写示范：」，采纳时会原样写进正文
const REWRITE_LABEL = /^【?(?:改写示范|示范改写|改写建议|精修改写)】?\s*[：:]\s*/;

export function normalizeParagraphCritique(raw: unknown, fallbackIndex: number): DraftParagraphCritique | null {
  if (!isObject(raw)) return null;
  const paragraph_text = text(raw.paragraph_text);
  const editor_comment = text(raw.editor_comment);
  if (!paragraph_text && !editor_comment) return null;
  const rewrite = text(raw.rewrite_suggestion).replace(REWRITE_LABEL, '').trim();
  return {
    index: typeof raw.index === 'number' ? raw.index : fallbackIndex,
    paragraph_text,
    grade: toGrade(raw.grade),
    editor_comment,
    ...(rewrite ? { rewrite_suggestion: rewrite } : {}),
  };
}

const CHARACTER_STATUSES: CharacterItem['status'][] = ['新登场', '已有角色', '退场/阵亡'];
const WORLD_CATEGORIES: WorldElement['category'][] = ['力量体系', '地理背景', '法则规则', '势力派系', '其他'];

function normalizeCharacter(raw: unknown): CharacterItem | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name);
  if (!name) return null;
  const status = text(raw.status);
  return {
    name,
    role: text(raw.role),
    status: CHARACTER_STATUSES.find((s) => s === status) ?? '新登场',
    key_action: text(raw.key_action),
    inner_motivation: text(raw.inner_motivation),
  };
}

function normalizeWorldElement(raw: unknown): WorldElement | null {
  if (!isObject(raw)) return null;
  const term = text(raw.term);
  if (!term) return null;
  const category = text(raw.category);
  return {
    term,
    category: WORLD_CATEGORIES.find((c) => c === category) ?? '其他',
    description: text(raw.description),
  };
}

// 整章拆解里的段落批注：作用与点评都没有的视为无效，不补写固定点评
function normalizeChapterParagraph(raw: unknown, fallbackIndex: number): ParagraphAnalysis | null {
  if (!isObject(raw)) return null;
  const purpose = text(raw.purpose);
  const editor_comment = text(raw.editor_comment);
  if (!purpose && !editor_comment) return null;
  const role = text(raw.role_type);
  return {
    index: typeof raw.index === 'number' ? raw.index : fallbackIndex,
    paragraph_excerpt: text(raw.paragraph_excerpt),
    role_type: ROLE_TYPES.find((r) => role.includes(r)) ?? '人物动作',
    technique: text(raw.technique),
    purpose,
    psychological_effect: text(raw.psychological_effect),
    editor_comment,
  };
}

// 整章拆解：剧情概括与张力分是图表、完成率与批量统计的依据，缺任一项返回 null 由调用方报错重试，
// 不再默认 5 分或填固定文案；其余字段缺失留空，结构不对的条目丢弃
export function normalizeChapterAnalysis(raw: unknown, chapterTitle: string): ChapterAnalysis | null {
  if (!isObject(raw)) return null;
  const summary = text(raw.summary);
  const tension = toScore(raw.tension_score, 10);
  if (!summary || tension === null) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    chapter_id: 0,
    chapter_title: chapterTitle,
    summary,
    tension_score: Math.max(1, tension),
    narrative_hook: text(raw.narrative_hook),
    technique_notes: text(raw.technique_notes),
    characters: list(raw.characters).map(normalizeCharacter).filter((c): c is CharacterItem => c !== null),
    world_elements: list(raw.world_elements).map(normalizeWorldElement).filter((w): w is WorldElement => w !== null),
    paragraph_analyses: list(raw.paragraph_analyses)
      .map((p, i) => normalizeChapterParagraph(p, i + 1))
      .filter((p): p is ParagraphAnalysis => p !== null),
  };
}
