// 大纲与连贯性：章节摘要（前情提要的来源）、AI 拆细纲、按前情更新设定卡
import type { CardUpdateSuggestion, ChapterPlan, ChapterSummary, CharacterItem, WorldElement } from '../types';
import { callLLM, extractAndParseJson, type LLMConfig } from './llm.ts';
import { normalizeCardSuggestions, normalizeChapterPlans, normalizeChapterSummary } from './normalize.ts';
import { hashText } from '../utils/chapterSummary.ts';
import { excerptHeadTail } from '../utils/storyContext.ts';

const SUMMARY_SOURCE_MAX_CHARS = 12000;

function parseOrRetry(raw: string, what: string): unknown {
  try {
    return extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error(`${what}解析失败，请重试`);
  }
}

export interface SummarizeInput {
  title: string;
  content: string;
  storyContext: string; // 人物卡与设定卡，用来认人认物
}

// 摘要记下读的是哪一版正文（content_hash），之后正文改过就算过期
export async function summarizeChapter(config: LLMConfig, input: SummarizeInput, signal?: AbortSignal): Promise<ChapterSummary> {
  const systemPrompt = `你是一位网文责编，负责给作者写好的章节做「前情提要」，供后面的章节接续时查阅。
要求：
1. summary：150 字以内，按顺序写清本章发生了什么、结束时停在哪里；只写正文里明确发生的事，不评价、不预测。
2. state_changes：会影响后文的变化，每条 40 字以内、最多 8 条——人物生死、受伤、去向、身份暴露、关系转变；道具与资源的得失和归属；寿元、次数、期限等数字的变化；新登场的重要人物或新揭示的设定；埋下或回收的伏笔。没有就给空数组。
3. 人名、地名、道具名照抄正文。【设定】只用来认人认物，不要把设定里有、本章没写的事写进摘要。
严格输出纯 JSON（无 markdown 反引号）：
{"summary": "……", "state_changes": ["……"]}`;

  const truncated = input.content.length > SUMMARY_SOURCE_MAX_CHARS;
  const userPrompt = `${input.storyContext ? `【设定】\n${input.storyContext}\n\n` : ''}章节：${input.title}\n正文${truncated ? '（过长已省略中段，最后一段即章末）' : ''}：\n${excerptHeadTail(input.content, SUMMARY_SOURCE_MAX_CHARS)}`;

  const raw = await callLLM(config, systemPrompt, userPrompt, { signal });
  const summary = normalizeChapterSummary(parseOrRetry(raw, '章节摘要'), hashText(input.content));
  if (!summary) throw new Error('章节摘要不完整（缺少摘要正文），请重试');
  return summary;
}

export interface PlanInput {
  count: number;
  startNumber: number;
  bookOutline: string; // 选中的脑洞：书名、题材、金手指、冲突、三幕
  volumeOutline: string;
  storyContext: string; // 设定、前情提要、最新一章结尾
  existingOutlines: string[]; // 本卷还没写的章节原定的细纲
  direction: string; // 作者希望的走向，可为空
}

export async function planChapters(config: LLMConfig, input: PlanInput, signal?: AbortSignal): Promise<ChapterPlan[]> {
  const systemPrompt = `你是一位网文主编，负责按大纲和已写进度给作者拆后续章节的细纲。
要求：
1. 从已写的进度接着往下拆，不重复写过的事；人物、道具、数字与【前情提要】和设定一致，已退场/阵亡的人物不再以活人出场。
2. 每章 3-5 个节拍，按发生顺序逐条写，每条一句话（40 字以内），最后一条以「章末：」写这一章停在哪（悬念、反转或情绪落点；收束全卷的一章收住即可）。
3. 每章推进一步主线，方向按本卷大纲；不要擅自引入设定里没有的新势力、新组织或新的主线谜团。
4. title 写完整章名，编号从指定的章数起依次递增，格式沿用前情里已写章节的写法；没有已写章节时用「第N章 章名」。
5. 作者给了走向时优先照走向拆；原定细纲可以参考和调整，与前情冲突时以前情为准。
严格输出纯 JSON（无 markdown 反引号）：
{"chapters": [{"title": "第N章 章名", "outline": ["1. ……", "2. ……", "章末：……"]}]}`;

  const userPrompt = [
    `请拆接下来 ${input.count} 章（从第 ${input.startNumber} 章开始）的细纲。`,
    input.bookOutline.trim() ? `【全书大纲】\n${input.bookOutline.trim()}` : '',
    input.volumeOutline.trim() ? `【本卷大纲】\n${input.volumeOutline.trim()}` : '',
    input.storyContext,
    input.existingOutlines.length > 0 ? `【原定的后续细纲】（可以调整）\n${input.existingOutlines.map((o) => `- ${o}`).join('\n')}` : '',
    input.direction.trim() ? `【作者希望的走向】${input.direction.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = await callLLM(config, systemPrompt, userPrompt, { signal });
  const plans = normalizeChapterPlans(parseOrRetry(raw, '细纲'), input.startNumber);
  if (!plans) throw new Error('细纲生成结果为空，请重试');
  return plans.slice(0, input.count);
}

export interface CardUpdateInput {
  characters: CharacterItem[];
  worldElements: WorldElement[];
  recap: string; // 前情提要（含本章）
}

// 空数组表示设定卡已经跟上前情
export async function suggestCardUpdates(config: LLMConfig, input: CardUpdateInput, signal?: AbortSignal): Promise<CardUpdateSuggestion[]> {
  const systemPrompt = `你是一位网文设定编辑，负责让人物卡、设定卡跟上正文进度。对照【前情提要】里已经发生的事，找出卡片里过时或缺失的地方。
要求：
1. 只根据前情提要里明确写到的变化提建议，没写到的不要猜；卡片记的是全书最新进度。
2. 人物（target 为 character）：status 只能是「新登场」「已有角色」「退场/阵亡」之一，身亡或永久离场的改为「退场/阵亡」；也可以更新 role（身份）、key_action（最近的关键行动）、inner_motivation（动机）。
3. 设定（target 为 world）：可以更新 description（道具易主、规则或代价被揭示、数字变化）与 category（只能是「力量体系」「地理背景」「法则规则」「势力派系」「其他」之一）。
4. 前情里对后文有影响、但还没有卡的人物或设定，用它的名字提出新增，changes 写全：人物要有 role，设定要有 category 和 description。
5. changes 只写要改的字段；没有要改的就输出空数组。最多 8 条，reason 写依据（第几章发生了什么）。
严格输出纯 JSON（无 markdown 反引号）：
{"updates": [{"target": "character", "name": "人物名", "changes": {"status": "退场/阵亡"}, "reason": "第五章被反噬身亡"}]}`;

  const userPrompt = `【人物卡】\n${JSON.stringify(input.characters)}\n\n【设定卡】\n${JSON.stringify(input.worldElements)}\n\n${input.recap}`;

  const raw = await callLLM(config, systemPrompt, userPrompt, { signal });
  const list = normalizeCardSuggestions(parseOrRetry(raw, '设定卡建议'));
  if (!list) throw new Error('设定卡建议解析失败，请重试');
  return list;
}
