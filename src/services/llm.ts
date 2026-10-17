import type { ChapterAnalysis, BrainwaveIdea, ReviewReport, ParagraphAnalysis, DraftParagraphCritique } from '../types';
import type { AuthorStyle } from '../data/authorStyles';
import { fetchTextWithRetry } from './http.ts';
import { stripThinking } from './thinking.ts';
import { routeThroughSiteProxy } from './corsProxy.ts';
import { describeHttpError, describeNetworkError, isNetworkError } from './llmErrors.ts';
import {
  normalizeBrainwaveIdea,
  normalizeReviewReport,
  normalizeParagraphCritique,
  normalizeDiagnosis,
  normalizeConsistencyReport,
  normalizeParagraphAnalysis,
  normalizeChapterAnalysis,
} from './normalize.ts';
import { splitParagraphs, buildNumberedChapterText } from '../utils/paragraphs.ts';
import { excerptHeadTail } from '../utils/storyContext.ts';
import { CRITIQUE_BATCH_SIZE } from '../utils/critique.ts';

const CONNECTION_TEST_TIMEOUT_MS = 30_000;
const countChars = (text: string) => text.replace(/\s+/g, '').length;
const CHAPTER_PROMPT_MAX_CHARS = 6000;
const DIAGNOSIS_MAX_CHARS = 3000;
const CONSISTENCY_MAX_CHARS = 6000;
// 润色后篇幅允许的浮动范围（相对原文）
const POLISH_MIN_RATIO = 0.85;
const POLISH_MAX_RATIO = 1.15;
const INVALID_RESPONSE_MESSAGE = '模型服务返回的内容不是 OpenAI 兼容格式，请检查 Base URL 是否指向 /v1 接口';

export interface LLMCallOptions {
  signal?: AbortSignal;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// 规范化补齐 OpenAI 协议的 chat completion 接口地址
function buildChatUrl(baseUrl: string): string {
  let clean = baseUrl.trim().replace(/\/+$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  
  if (clean.endsWith('/chat/completions')) {
    return clean;
  }
  if (clean.endsWith('/v1')) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

// 健壮的 JSON 提取与解析辅助函数（兼容各家大模型，如 DeepSeek-R1 思考链、代码块反引号、前后缀说明文等）
export function extractAndParseJson<T = any>(raw: string, fallback?: T): T {
  // 1. 去除 <think>...</think> 思考链内容 (如 DeepSeek-R1)
  let cleaned = stripThinking(raw);

  // 2. 优先提取 ```json ... ``` 或 ``` ... ``` 中的内容
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 3. 尝试直接解析
  try {
    return JSON.parse(cleaned);
  } catch {
    // 4. 寻找最外层的 {} 或 []
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket > firstBracket && (firstBrace === -1 || firstBracket < firstBrace)) {
      try {
        const candidate = cleaned.slice(firstBracket, lastBracket + 1);
        return JSON.parse(candidate);
      } catch {}
    } else if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const candidate = cleaned.slice(firstBrace, lastBrace + 1);
        return JSON.parse(candidate);
      } catch {}
    }

    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error('解析大模型返回的 JSON 结构失败');
  }
}

export async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const url = routeThroughSiteProxy(buildChatUrl(config.baseUrl));

  let response;
  try {
    response = await fetchTextWithRetry(url, {
      method: 'POST',
      // 只用 Bearer 鉴权；经本站代理时也不收发 Cookie（否则上游的会话 Cookie 会落到本站域名下）
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    }, { signal: options.signal });
  } catch (err) {
    if (isNetworkError(err)) throw new Error(describeNetworkError(url));
    throw err;
  }

  const rawText = response.text;

  if (!response.ok) {
    throw new Error(describeHttpError(response.status, rawText));
  }

  try {
    const data = JSON.parse(rawText);
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  } catch {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
}


export async function testLLMConnection(config: LLMConfig): Promise<{ success: boolean; message: string; duration: number }> {
  const startTime = Date.now();
  const url = routeThroughSiteProxy(buildChatUrl(config.baseUrl));

  try {
    const response = await fetchTextWithRetry(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 15,
        temperature: 0.1,
      }),
    }, { maxRetries: 0, timeoutMs: CONNECTION_TEST_TIMEOUT_MS });

    const duration = Date.now() - startTime;
    const rawText = response.text;

    if (!response.ok) {
      return {
        success: false,
        message: `${describeHttpError(response.status, rawText)}（请求地址：${url}）`,
        duration,
      };
    }

    try {
      const data = JSON.parse(rawText);
      const reply = data.choices?.[0]?.message?.content?.trim() || '无返回文本';
      return {
        success: true,
        message: `验证成功！模型回复: "${reply}" (耗时 ${duration}ms)`,
        duration,
      };
    } catch {
      return {
        success: false,
        message: `${INVALID_RESPONSE_MESSAGE}（返回内容：${rawText.slice(0, 100)}）`,
        duration,
      };
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const msg = isNetworkError(err) ? describeNetworkError(url) : err.message || '网络连接失败';
    return {
      success: false,
      message: msg,
      duration,
    };
  }
}

// 拆解单章（含段落级显微镜解构与【专业总编点评】）
export async function analyzeChapterWithLLM(
  config: LLMConfig,
  chapterTitle: string,
  chapterContent: string,
  options: LLMCallOptions = {}
): Promise<ChapterAnalysis> {
  const systemPrompt = `你是一位顶级网文与出版畅销小说的金牌主编兼小说解构大师。
请针对给定的单章文本进行硬核、深度逆向拆解。
【核心要求】：优秀小说的核心技巧都藏在具体段落与句式间。除了全章宏观概括外，必须提取本章 4-8 个最关键的代表性自然段进行【段落级显微镜分析与专业总编毒辣点评】！
【段落编号】：正文每个自然段前已标注编号 [n]，paragraph_analyses 中的 index 必须使用该编号，paragraph_excerpt 必须逐字摘自该段开头；超长章节的中间部分已省略，只分析给出的段落。
严格以纯 JSON 格式输出（不要包含 markdown 代码块反引号，直接输出纯 JSON），字段定义如下：
{
  "summary": "100字以内的核心剧情事件脉络",
  "tension_score": 8,
  "narrative_hook": "本章开篇或结尾的核心悬念/钩子，作者是如何留住读者的",
  "characters": [
    {
      "name": "角色名",
      "status": "新登场" | "已有角色" | "退场/阵亡",
      "role": "身份或定位",
      "key_action": "本章关键行动",
      "inner_motivation": "内心驱动力或欲望"
    }
  ],
  "world_elements": [
    {
      "term": "设定名",
      "category": "力量体系" | "地理背景" | "法则规则" | "势力派系" | "其他",
      "description": "设定的运作逻辑或代价"
    }
  ],
  "technique_notes": "分析作者在本章运用的写作手法（如限制视角、冷开场、三翻四抖、移情手法、铺垫伏笔）",
  "paragraph_analyses": [
    {
      "index": 1,
      "paragraph_excerpt": "段落开头的前25个字...",
      "role_type": "悬念铺设" | "环境氛围" | "人物动作" | "对白交锋" | "心理生理" | "世界观渗透" | "危机转折" | "黄金断章",
      "technique": "使用的具体手法 (如: 冷开场/限制视角/感官通感/移情法/潜台词试探/信息差留白)",
      "purpose": "这一段的作用与叙事目的是什么？作者为什么在这个节点写这一段？",
      "psychological_effect": "对读者的心理预期与追读情绪产生了怎样的调动效果？",
      "editor_comment": "【金牌总编深度点评】：以网文老白主编的视角，犀利毒辣地点评这一段到底绝在哪里、为何普通作者写不出来、值得新人学习模仿的核心机理。"
    }
  ]
}`;

  const numberedText = buildNumberedChapterText(splitParagraphs(chapterContent), CHAPTER_PROMPT_MAX_CHARS);
  const userPrompt = `章节标题：${chapterTitle}\n\n章节正文如下（已按自然段编号）：\n${numberedText}`;

  const raw = await callLLM(config, systemPrompt, userPrompt, options);

  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('解析大模型返回的 JSON 结构失败，请重试');
  }
  // 结构校验见 normalizeChapterAnalysis：缺剧情概括或张力分时报错重试，不编造分数与点评
  const analysis = normalizeChapterAnalysis(parsed, chapterTitle);
  if (!analysis) throw new Error('拆解结果不完整（缺少剧情概括或张力分），请重试');
  return analysis;
}

// 针对用户选中的原著特定段落进行实时微观解剖与总编点评
export async function analyzeSelectedParagraph(
  config: LLMConfig,
  paragraphText: string,
  chapterContext: string
): Promise<ParagraphAnalysis> {
  const systemPrompt = `你是一位千万级畅销网络小说的白金总编辑。
请对用户选中的这一具体小说段落进行微观解剖与毒辣点评：
严格输出纯 JSON（无 markdown 反引号）：
{
  "index": 0,
  "paragraph_excerpt": "节选...",
  "role_type": "悬念铺设" | "环境氛围" | "人物动作" | "对白交锋" | "心理生理" | "世界观渗透" | "危机转折" | "黄金断章",
  "technique": "使用的具体文学/网文手法",
  "purpose": "这一段在上下文中的核心作用与写作意图",
  "psychological_effect": "调动读者的何种情绪与期待",
  "editor_comment": "【主编深度点评】：一针见血点评此段的精妙之处与商业连载技巧。"
}`;

  const userPrompt = `【章节上下文】：\n${chapterContext.slice(0, 1000)}\n\n【选中的段落】：\n${paragraphText}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);
  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('段落剖析结果解析失败，请重试');
  }
  const analysis = normalizeParagraphAnalysis(parsed, paragraphText);
  if (!analysis) throw new Error('段落剖析结果不完整（缺少点评），请重试');
  return analysis;
}

// 仿写创作台——AI 专业主编逐段旁批与精修示范（注入名家文风）
export async function critiqueDraftParagraphsWithLLM(
  config: LLMConfig,
  draftContent: string,
  referenceStyle?: string,
  authorStyle?: AuthorStyle,
  startParagraph = 0
): Promise<DraftParagraphCritique[]> {
  // 每次批一批（startParagraph 起的 CRITIQUE_BATCH_SIZE 段），模型按批内 1 起编号，返回后换算成全章段号
  const paragraphs = splitParagraphs(draftContent).slice(startParagraph, startParagraph + CRITIQUE_BATCH_SIZE);
  if (paragraphs.length === 0) return [];

  const styleContext = authorStyle 
    ? `【重点审查是否符合大师风格·${authorStyle.name}（${authorStyle.tone_tag}）】\n${authorStyle.stylistic_guideline}`
    : `参考节奏标准：${referenceStyle || '对标名作黄金开局法则：快节奏、高压迫、少废话'}`;

  const systemPrompt = `你是一位眼光苛刻、经验极度老辣的千万级爆款网文总编辑兼白金改稿专家。
作者正在进行针对特定名家文风的仿写实践。
${styleContext}

请对下面列出的每个自然段进行【专业主编逐段旁批】：
1. 评定等级：'优秀·黄金段' | '合格·推进平稳' | '硬伤·拖沓灌水' | '出戏·人设矛盾'；
2. 主编点评：极其一针见血，毫不客气地指出这段写得好在何处，或者存在什么废话、说明文倒灌、动机不清等硬伤，尤其是是否具备所选作家的神髓；
3. 精修改写建议：若有不足，给出 1-2 句完全符合该白金作家笔触的高质感改写示范！rewrite_suggestion 会被直接替换进正文，只写改写后的正文，不加任何前缀标签。

严格以纯 JSON 数组格式输出（无 markdown 反引号）：
[
  {
    "index": 1,
    "paragraph_text": "段落原文摘要...",
    "grade": "优秀·黄金段",
    "editor_comment": "【主编批注】：动作抓人，但第2句心理描写略显直白，建议用身体冷颤代替喃喃自语。",
    "rewrite_suggestion": "指尖触碰到黏稠冰冷的血迹，瞳孔瞬间收缩成针芒状。"
  }
]`;

  const userPrompt = `待点评正文段落列表：\n${JSON.stringify(paragraphs)}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);
  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('主编旁批结果解析失败，请重试');
  }
  // 模型给的段号超出本批范围（0 起编号、用了全章段号）或重复时，按回复顺序编号，免得和其他批撞号或误判已批到哪
  const used = new Set<number>();
  const items = (Array.isArray(parsed) ? parsed : [])
    .map((item, i) => normalizeParagraphCritique(item, i + 1))
    .filter((item): item is DraftParagraphCritique => item !== null)
    .map((item, i) => {
      const valid = item.index >= 1 && item.index <= paragraphs.length && !used.has(item.index);
      const local = valid ? item.index : i + 1;
      used.add(local);
      return { ...item, index: local + startParagraph };
    });
  if (items.length === 0) throw new Error('主编旁批结果为空，请重试');
  return items;
}

// 脑洞推演生成
export async function generateBrainwaveWithLLM(
  config: LLMConfig,
  genre: string,
  referenceSkeleton: string
): Promise<BrainwaveIdea> {
  const systemPrompt = `你是一位极具创意的网文金牌策划与脑洞设计师。
请基于用户指定的题材风格与参考的经典小说骨架，进行一次惊艳的“骨架迁移与设定重构”，输出一份新小说的立项脑洞。
严格输出纯 JSON（不加反引号）：
{
  "title": "极具网文爽点与吸引力的书名",
  "genre": "题材名",
  "source_skeleton": "简述迁移了参考骨架的哪一部分",
  "golden_finger": "金手指设定，必须包含强爽点和对应的副作用/代价约束机制",
  "main_conflict": "主角的核心核心目标与最大的系统性阻碍",
  "three_act_beats": {
    "act1": "第一幕(起): 破局点与初始绝境",
    "act2": "第二幕(承): 势力升级、危机连环与伪胜利/低谷转折",
    "act3": "第三幕(转合): 终局牺牲/破茧而出与首卷大高潮"
  }
}`;

  const userPrompt = `目标题材：${genre}\n\n参考的故事骨架与节奏：\n${referenceSkeleton}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);

  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('脑洞生成 JSON 格式解析失败');
  }
  const idea = normalizeBrainwaveIdea(parsed, `idea-${Date.now()}`);
  if (!idea) throw new Error('脑洞生成结果不完整（缺少书名或核心设定），请重试');
  return idea;
}

// 审稿打分
export async function reviewDraftWithLLM(
  config: LLMConfig,
  title: string,
  content: string,
  referenceStyle?: string
): Promise<ReviewReport> {
  const systemPrompt = `你是一位极其苛刻、眼光毒辣的千万级爆款网文主编与文学评审。
请对作者提交的章节草稿进行多维度盲审打分与深度诊断。
严格输出纯 JSON（无额外文字与反引号）：
{
  "score_overall": 82,
  "radar": {
    "hook_strength": 85,
    "pacing_tension": 78,
    "character_arc": 80,
    "curiosity_gap": 88,
    "trope_freshness": 75
  },
  "pros": [
    "优点 1",
    "优点 2"
  ],
  "cons": [
    "毒点/硬伤 1",
    "毒点/硬伤 2"
  ],
  "revision_suggestions": [
    "具体的修改方案 1",
    "具体的修改方案 2"
  ]
}`;

  const userPrompt = `稿件标题：${title}\n参考风格/要求：${referenceStyle || '默认爆款节奏'}\n\n稿件正文：\n${content}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);

  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('审稿报告 JSON 解析失败');
  }
  const report = normalizeReviewReport(parsed);
  if (!report) throw new Error('审稿报告不完整（缺少总分或五维评分），请重试');
  return report;
}

// 🌟 仿写创作台伴写能力：深度注入名家文风 🌟

// 1. AI 启发式生成初稿范本 (注入所选名家文风)
export async function generateInspirationDraft(
  config: LLMConfig,
  title: string,
  referenceBeat: string,
  ideaContext?: string,
  authorStyle?: AuthorStyle,
  storyContext = ''
): Promise<string> {
  const styleInstruction = authorStyle
    ? `【必须严格模仿作家·${authorStyle.name}（${authorStyle.tone_tag}）的行文神韵】\n${authorStyle.stylistic_guideline}`
    : '文风风格：现代紧凑网文、强张力冷开场。';

  const systemPrompt = `你是一位顶级畅销网络小说家兼白金作家导师。
你的任务是：根据给定的章节目标、参考的名作节奏节拍（如黄金开局三要素、死局危机介入），以及设定的立项背景，创作一份极高质感、节奏紧凑、戏剧张力爆棚的【1000字启发式章节初稿范本】。

${styleInstruction}

写作通用原则：
1. 坚决杜绝开头倒灌设定说明文，前三句话直接将主角推进致命危机或强烈冲突的第一现场！
2. 调动感官细节（光线、气味、生理刺痛、冷汗），营造强烈的沉浸感与压迫感。
3. 行文末尾必须留下一个让读者不得不翻下一页的致命悬念（Hook）！${storyContext ? `
4. 这是接续前文的一章：开头要接上前一章结尾，人名、称谓、地名、道具与规则一律沿用【前情与设定】，不要另起炉灶，也不要给人物改名。` : ''}
直接输出小说正文。`;

  const userPrompt = `${storyContext ? `【前情与设定】\n${storyContext}\n\n` : ''}章节标题：${title}\n立项脑洞背景：${ideaContext || '赛博修真/现代超自然悬疑'}\n参考的名作结构与节拍：\n${referenceBeat}\n\n请直接输出小说正文：`;

  // 正文类输出会直接写进章节，推理模型的思考过程必须去掉
  return stripThinking(await callLLM(config, systemPrompt, userPrompt));
}

// 2. AI 智能续写 (注入名家文风)
export async function expandStoryDraft(
  config: LLMConfig,
  context: string,
  instruction: string = '顺着当前局势自然推进剧情',
  authorStyle?: AuthorStyle,
  storyContext = ''
): Promise<string> {
  const stylePrompt = authorStyle
    ? `文风限定：完全按照【${authorStyle.name}】的笔触与叙事逻辑续写（${authorStyle.tone_tag}）。\n${authorStyle.stylistic_guideline}`
    : '';

  const systemPrompt = `你是一位资深网络小说家。请基于作者当前写好的上下文，自然、连贯地向下续写展开 400-600 字。
${stylePrompt}
要求：
1. 保持既有文风与人称，紧接上文最后一句往下写，推进剧情动作，不要突兀转折。
2. 作者给了续写指令时，这一段严格按指令写。
3. 人名、称谓、地名、道具与规则以上文和【前情与设定】为准；不要擅自引入设定里没有的新势力、新组织或新的主线谜团，可以在已有矛盾上加压。
直接输出续写正文。`;

  const userPrompt = `${storyContext ? `【前情与设定】\n${storyContext}\n\n` : ''}当前已有正文：\n${context.slice(-2500)}\n\n作者续写指令：${instruction}`;

  return stripThinking(await callLLM(config, systemPrompt, userPrompt));
}

// 3. AI 感官与张力深度润色 (注入名家文风)
export async function polishStoryDraft(
  config: LLMConfig,
  textToPolish: string,
  stylePreference: string = '增强感官压迫感与电影级画面感',
  authorStyle?: AuthorStyle
): Promise<string> {
  const stylePrompt = authorStyle
    ? `精修目标：将以下文本润色为【${authorStyle.name}】的招牌文风。\n${authorStyle.stylistic_guideline}`
    : `润色偏好：${stylePreference}`;
  const length = countChars(textToPolish);
  const minLength = Math.round(length * POLISH_MIN_RATIO);
  const maxLength = Math.round(length * POLISH_MAX_RATIO);

  const systemPrompt = `你是一位千万级畅销小说的金牌文字总监。
请对作者提交的文本段落进行精修润色：
${stylePrompt}
1. 删去臃肿干瘪的说明性词汇，用更精准动感的动词和冷峻的感官描写代替。
2. 强化潜台词与心理张力，做到“Show, Don't Tell”。
3. 保持原剧情脉络不变，提升文学表现力与网文节奏感。
4. 原文 ${length} 字，润色后控制在 ${minLength}–${maxLength} 字之间，不新增情节、人物和设定。
5. 人名、地名、称谓、数字、时间、道具与功法名称照抄原文，不得改动。
直接输出润色后的正文。`;

  const userPrompt = `待润色正文（${length} 字，润色后不超过 ${maxLength} 字，宁短勿长）：\n${textToPolish}`;

  return stripThinking(await callLLM(config, systemPrompt, userPrompt));
}

export interface RealtimeDiagnosis {
  match_score: number;
  tension_score: number;
  hook_detected: boolean;
  pacing_status: '节奏紧凑' | '略有拖沓/说明过多' | '冲突过激';
  instant_feedback: string;
}

export async function diagnoseDraftRealtime(
  config: LLMConfig,
  currentDraft: string,
  referenceBeat: string
): Promise<RealtimeDiagnosis> {
  const systemPrompt = `你是一位小说节奏与黄金开局伴写评审。请快速评估作者当前写出的文本是否符合参考名作的节奏要求。
严格输出纯 JSON（不加反引号）：
{
  "match_score": 85,
  "tension_score": 8,
  "hook_detected": true,
  "pacing_status": "节奏紧凑",
  "instant_feedback": "前200字危机到位，但第3段出现了较长的世界观说明，建议精简并转化为主角的动作观察。"
}
判断章末钩子（hook_detected）和断章时，以正文最后一段为准。`;

  const truncated = currentDraft.length > DIAGNOSIS_MAX_CHARS;
  const userPrompt = `参考的目标节奏与手法：\n${referenceBeat}\n\n作者当前正文（共 ${countChars(currentDraft)} 字${truncated ? '，过长已省略中段，最后一段即章末' : ''}）：\n${excerptHeadTail(currentDraft, DIAGNOSIS_MAX_CHARS)}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);
  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('节奏诊断结果解析失败，请重试');
  }
  const diagnosis = normalizeDiagnosis(parsed);
  if (!diagnosis) throw new Error('节奏诊断结果不完整（缺少评分），请重试');
  return diagnosis;
}

export interface AssetMappingResult {
  characters: Array<{
    name: string;
    role: string;
    key_action: string;
    inner_motivation: string;
    original_counterpart: string;
  }>;
  world_elements: Array<{
    term: string;
    category: string;
    description: string;
    original_counterpart: string;
  }>;
}

export async function mapAssetsToNewStory(
  config: LLMConfig,
  targetGenre: string,
  targetIdea: string,
  originalCharacters: Array<{ name: string; role: string; inner_motivation: string }>,
  originalWorld: Array<{ term: string; category: string; description: string }>
): Promise<AssetMappingResult> {
  const systemPrompt = `你是一位顶尖的小说世界观架构师与人设总监。
用户正在进行【逆向小说骨架迁移创作】。请参考原著的人物定位矩阵与世界观法则，将其映射转译为适合用户【新题材与新脑洞】的全新人设与全新设定集！
严格输出纯 JSON（无 markdown 反引号）：
{
  "characters": [
    {
      "name": "新角色名",
      "role": "身份/职能定位 (如: 主角/导师/官方反派)",
      "key_action": "开篇核心关键动作",
      "inner_motivation": "深层驱动力与欲望",
      "original_counterpart": "对应原著哪个原型角"
    }
  ],
  "world_elements": [
    {
      "term": "新设定名 (如: 算力灵根/序列芯片/天衍盘)",
      "category": "力量体系" | "地理背景" | "法则规则" | "势力派系",
      "description": "设定的运作逻辑与负面代价约束",
      "original_counterpart": "对应原著哪个原型设定"
    }
  ]
}`;

  const userPrompt = `新书目标题材：${targetGenre}\n新书立项设定：${targetIdea}\n\n原著参考角色：\n${JSON.stringify(originalCharacters.slice(0, 8))}\n\n原著参考设定：\n${JSON.stringify(originalWorld.slice(0, 8))}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);

  try {
    return extractAndParseJson<AssetMappingResult>(raw);
  } catch {
    throw new Error('AI 角色与设定映射生成失败，请重试');
  }
}

export interface ConsistencyConflict {
  type: 'character_conflict' | 'world_rule_breach' | 'logic_plot_hole';
  target: string;
  problem_excerpt: string;
  rule_violated: string;
  suggestion: string;
}

export interface ConsistencyCheckReport {
  is_consistent: boolean;
  consistency_score: number;
  conflicts: ConsistencyConflict[];
  overall_summary: string;
}

export async function checkDraftConsistency(
  config: LLMConfig,
  draftContent: string,
  characters: Array<{ name: string; role: string; inner_motivation: string; key_action: string }>,
  worldElements: Array<{ term: string; category: string; description: string }>,
  storyContext = ''
): Promise<ConsistencyCheckReport> {
  const systemPrompt = `你是一位专注于小说剧情严密性与防“吃设定”的首席总编审。
请将作者提交的正文内容，与作者维护的【新书人设矩阵】和【世界观规则设定】进行交叉比对，严格排查：
1. 角色言行是否与核心动机、身份定位相背离（如：谨慎内敛的主角突然无脑降智装逼）？
2. 是否违背了力量法则机制或金手指代价（如：设定了用一次扣除情感算力，但正文无视代价随意连续开挂）？
3. 是否存在前后逻辑冲突或道具机制自相矛盾？
注意：人设矩阵和世界观只记录了部分信息。正文里出现、设定里没写的人物、道具或事件，可能是前文已经交代过的，不要仅因设定里没写就判为冲突；只报告与给出的设定、前文结尾或本章前后文明确矛盾的地方。

严格以纯 JSON 格式输出（无 markdown 反引号）：
{
  "is_consistent": false,
  "consistency_score": 82,
  "conflicts": [
    {
      "type": "character_conflict" | "world_rule_breach" | "logic_plot_hole",
      "target": "涉及的角色名或设定名",
      "problem_excerpt": "正文中出现问题的段落节选（20字以内）",
      "rule_violated": "违背的具体设定规则或人设动机",
      "suggestion": "如何修改正文以保持设定严密性"
    }
  ],
  "overall_summary": "一句话总评，概括人设与设定一致性表现"
}`;

  const truncated = draftContent.length > CONSISTENCY_MAX_CHARS;
  const userPrompt = `${storyContext ? `${storyContext}\n\n` : ''}【维护的人设矩阵】：\n${JSON.stringify(characters.slice(0, 10))}\n\n【维护的世界观规则】：\n${JSON.stringify(worldElements.slice(0, 10))}\n\n【待检测正文】${truncated ? '（过长已省略中段）' : ''}：\n${excerptHeadTail(draftContent, CONSISTENCY_MAX_CHARS)}`;

  const raw = await callLLM(config, systemPrompt, userPrompt);
  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('一致性排查结果解析失败，请重试');
  }
  const report = normalizeConsistencyReport(parsed);
  if (!report) throw new Error('一致性排查结果不完整（缺少评分），请重试');
  return report;
}
