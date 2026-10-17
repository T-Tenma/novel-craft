// 大模型 JSON 结果的结构校验：缺字段补安全默认值，关键字段缺失时返回 null 由调用方报错重试，
// 不编造分数等关键信息。渲染层可以假定这里返回的结构完整。
import type { BrainwaveIdea, CardUpdateSuggestion, ChapterAnalysis, ChapterPlan, ChapterSummary, CharacterItem, DraftParagraphCritique, IdeaAssets, ParagraphAnalysis, ReviewReport, TechniquePrompt, WorldElement } from '../types';
import type { ConsistencyCheckReport, ConsistencyConflict, RealtimeDiagnosis } from './llm';
import { IDEA_PROMPT_PREFIX } from '../data/promptArsenal.ts';

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
    outline_gaps: textList(raw.outline_gaps),
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

const TECHNIQUE_LABELS: Record<TechniquePrompt['category'], string> = {
  atmosphere: '氛围渲染',
  action: '动作博弈',
  dialogue: '潜台词对白',
  psychology: '心理生理',
  plot_twist: '反转断章',
};
const IDEA_ASSET_MAX = 8;

const objects = (v: unknown) => (Array.isArray(v) ? v.filter(isObject) : []);
const uniqueBy = <T>(items: T[], key: (item: T) => string) => items.filter((item, i) => items.findIndex((x) => key(x) === key(item)) === i);

// 技法类别模型可能给英文 key 也可能给中文标签；都不认识时返回 null
function techniqueCategory(raw: string): TechniquePrompt['category'] | null {
  const keys = Object.keys(TECHNIQUE_LABELS) as TechniquePrompt['category'][];
  return keys.find((k) => k === raw || TECHNIQUE_LABELS[k] === raw) ?? null;
}

// 「采用此大纲」生成的新书资产：没名字的条目丢弃、同名去重；人物或设定为空时返回 null，调用方报错重试，不能把作者的卡片换成空的
export function normalizeIdeaAssets(raw: unknown): IdeaAssets | null {
  if (!isObject(raw)) return null;
  const characters = uniqueBy(
    objects(raw.characters).map(normalizeCharacter).filter((c): c is CharacterItem => c !== null),
    (c) => c.name,
  ).slice(0, IDEA_ASSET_MAX);
  const worldElements = uniqueBy(
    objects(raw.world_elements).map(normalizeWorldElement).filter((w): w is WorldElement => w !== null),
    (w) => w.term,
  ).slice(0, IDEA_ASSET_MAX);
  const techniques: TechniquePrompt[] = objects(raw.techniques)
    .filter((t) => text(t.name) && text(t.prompt_template))
    .slice(0, IDEA_ASSET_MAX)
    .map((t, i) => {
      // 不认识的类别归入「氛围渲染」，标签保留模型给的写法
      const category = techniqueCategory(text(t.category));
      return {
        id: `${IDEA_PROMPT_PREFIX}${i + 1}`,
        category: category ?? 'atmosphere',
        category_label: category ? TECHNIQUE_LABELS[category] : text(t.category) || TECHNIQUE_LABELS.atmosphere,
        name: text(t.name),
        description: text(t.description),
        prompt_template: text(t.prompt_template),
      };
    });
  if (characters.length === 0 || worldElements.length === 0) return null;
  return { characters, world_elements: worldElements, techniques };
}

// 章节摘要：摘要正文是前情提要的依据，缺了返回 null 由调用方报错重试
export function normalizeChapterSummary(raw: unknown, contentHash: string): ChapterSummary | null {
  if (!isObject(raw)) return null;
  const summary = text(raw.summary);
  if (!summary) return null;
  return { text: summary, state_changes: textList(raw.state_changes), content_hash: contentHash };
}

// AI 拆细纲：没有细纲内容的章节丢弃，没给章名的按编号补；一章都没有时返回 null
export function normalizeChapterPlans(raw: unknown, startNumber: number): ChapterPlan[] | null {
  const items = Array.isArray(raw) ? raw.filter(isObject) : isObject(raw) ? objects(raw.chapters) : [];
  const plans = items
    .map((item) => ({ title: text(item.title), outline: Array.isArray(item.outline) ? textList(item.outline).join('\n') : text(item.outline) }))
    .filter((plan) => plan.outline)
    .map((plan, i) => ({ ...plan, title: plan.title || `第 ${startNumber + i} 章` }));
  return plans.length > 0 ? plans : null;
}

const CHARACTER_FIELDS = ['status', 'role', 'key_action', 'inner_motivation'] as const;
const WORLD_FIELDS = ['category', 'description'] as const;

function cardChanges(raw: unknown, fields: readonly string[]): Record<string, string> {
  if (!isObject(raw)) return {};
  return Object.fromEntries(
    fields
      .map((field) => [field, text(raw[field])] as const)
      .filter(([field, value]) => {
        if (!value) return false;
        if (field === 'status') return CHARACTER_STATUSES.some((s) => s === value);
        if (field === 'category') return WORLD_CATEGORIES.some((c) => c === value);
        return true;
      }),
  );
}

// 设定卡更新建议：只认人物 / 设定两类与已知字段，枚举值不对的字段丢弃，没有可改字段的建议丢弃；
// 回复不是对象时返回 null（解析失败），空列表表示设定卡已与前情一致
export function normalizeCardSuggestions(raw: unknown): CardUpdateSuggestion[] | null {
  if (!isObject(raw)) return null;
  return objects(raw.updates).flatMap((item): CardUpdateSuggestion[] => {
    const name = text(item.name);
    const reason = text(item.reason);
    if (!name) return [];
    if (item.target === 'character') {
      const changes = cardChanges(item.changes, CHARACTER_FIELDS) as Partial<Omit<CharacterItem, 'name'>>;
      return Object.keys(changes).length > 0 ? [{ target: 'character', name, changes, reason }] : [];
    }
    if (item.target === 'world') {
      const changes = cardChanges(item.changes, WORLD_FIELDS) as Partial<Omit<WorldElement, 'term'>>;
      return Object.keys(changes).length > 0 ? [{ target: 'world', name, changes, reason }] : [];
    }
    return [];
  });
}

