export interface Chapter {
  id: number;
  title: string;
  word_count: number;
  preview: string;
  content: string;
}

export interface NovelMetadata {
  file_name: string;
  total_words: number;
  total_chapters: number;
  chapters: Chapter[];
}

export interface CharacterItem {
  name: string;
  status: '新登场' | '已有角色' | '退场/阵亡';
  role: string;
  key_action: string;
  inner_motivation: string;
}

export interface WorldElement {
  term: string;
  category: '力量体系' | '地理背景' | '法则规则' | '势力派系' | '其他';
  description: string;
}

// 🌟 核心扩展 1：原著段落级精细解构批注（含专业总编点评） 🌟
export interface ParagraphAnalysis {
  index: number;
  paragraph_excerpt: string; // 段落摘要或前30字
  role_type: '悬念铺设' | '环境氛围' | '人物动作' | '对白交锋' | '心理生理' | '世界观渗透' | '危机转折' | '黄金断章';
  technique: string; // 使用的手法，如: 限制视角、冷开场、白描、移情通感、三翻四抖
  purpose: string; // 叙事目的与意图 (为什么要写这一段？)
  psychological_effect: string; // 对读者产生的心理预期或情绪调动
  editor_comment: string; // 🌟 顶级总编深度毒辣点评（好在哪里/为何高明）
}

export interface ChapterAnalysis {
  chapter_id: number;
  chapter_title: string;
  summary: string;
  tension_score: number; // 1 - 10
  narrative_hook: string; // 本章核心悬念/钩子
  characters: CharacterItem[];
  world_elements: WorldElement[];
  technique_notes: string; // 叙事技法/伏笔技巧
  paragraph_analyses?: ParagraphAnalysis[]; // 段落级显微镜分析列表
}

// 🌟 核心扩展 2：仿写创作台——作者自写段落的「专业编辑逐段旁批」 🌟
export interface DraftParagraphCritique {
  index: number;
  paragraph_text: string;
  grade: '优秀·黄金段' | '合格·推进平稳' | '硬伤·拖沓灌水' | '出戏·人设矛盾';
  editor_comment: string; // 主编点评：好在哪里或硬伤在哪
  rewrite_suggestion?: string; // 具体的优化/改写示范
}

// 脑洞推演卡片
export interface BrainwaveIdea {
  id: string;
  title: string;
  genre: string; // 题材如: 赛博修真、悬疑克苏鲁
  source_skeleton: string; // 借鉴的原作骨架
  golden_finger: string; // 金手指与代价机制
  main_conflict: string; // 核心冲突与动机
  three_act_beats: {
    act1: string; // 起: 破局点与初始危机
    act2: string; // 承: 阻碍升级与伪胜利/低谷
    act3: string; // 转合: 终局代价与破茧高潮
  };
}

// 审稿评分报告
export interface ReviewReport {
  score_overall: number; // 总评分 (0-100)
  // 各维度 0-100；模型漏给的维度为 null（显示「未评」，不当作 0 分）
  radar: {
    hook_strength: number | null; // 开篇黄金钩子
    pacing_tension: number | null; // 节奏与张力曲线
    character_arc: number | null; // 人设辨识度与动机
    curiosity_gap: number | null; // 悬念留白与伏笔
    trope_freshness: number | null; // 设定新颖度与毒点规避
  };
  pros: string[]; // 亮点优势
  cons: string[]; // 致命毒点/拖沓点
  revision_suggestions: string[]; // 具体的修改与改稿方案
}

// 多卷多章项目树
export interface StoryChapter {
  id: string;
  title: string;
  content: string;
  word_count: number;
  status: 'draft' | 'completed';
  reference_chapter_id?: number;
}

export interface StoryVolume {
  id: string;
  title: string;
  description: string;
  chapters: StoryChapter[];
  // 这一卷开始一本新书（「采用此大纲」或「作为对照大纲直接仿写」新建的卷）：AI 前情不再带上之前的卷
  starts_new_book?: boolean;
}

export interface MyStoryProject {
  id: string;
  title: string;
  genre: string;
  volumes: StoryVolume[];
}

// 场景化名家技法 Prompt 武器库
// 「采用此大纲立即仿写」按脑洞生成的新书人物卡、世界设定与本书技法
export interface IdeaAssets {
  characters: CharacterItem[];
  world_elements: WorldElement[];
  techniques: TechniquePrompt[];
}

export interface TechniquePrompt {
  id: string;
  category: 'atmosphere' | 'action' | 'dialogue' | 'psychology' | 'plot_twist';
  category_label: string;
  name: string;
  description: string;
  prompt_template: string;
}
