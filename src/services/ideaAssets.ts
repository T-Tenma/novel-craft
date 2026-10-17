// 「采用此大纲立即仿写」时按脑洞生成新书的人物卡、世界设定与本书技法，替换首次启动的演示数据
// （赛博题材的林宵、九龙贫民窟等），否则创作台的 AI 前情里带的是别的书的人设
import type { BrainwaveIdea, IdeaAssets } from '../types';
import { callLLM, extractAndParseJson, type LLMConfig } from './llm.ts';
import { normalizeIdeaAssets } from './normalize.ts';

// signal：作者离开脑洞页时取消，免得请求返回后在别的页面悄悄替换人物卡
export async function generateIdeaAssets(config: LLMConfig, idea: BrainwaveIdea, signal?: AbortSignal): Promise<IdeaAssets> {
  const systemPrompt = `你是一位网文立项策划，负责把一份新书大纲落成可以直接开写的人物卡、世界设定与本书专属写作技法。
要求：
1. characters：3-6 个，主角、主要对手与关键配角；名字、身份与大纲一致，key_action 写开篇的关键行动，inner_motivation 写深层动机。
2. world_elements：3-6 条；金手指的运作规则与代价必须单列一条写清楚，其余写势力、地理或法则；category 只能是「力量体系」「地理背景」「法则规则」「势力派系」「其他」之一。
3. techniques：4-6 条贴合本书题材与关键场景的写作技法；category 只能是 atmosphere / action / dialogue / psychology / plot_twist；prompt_template 是交给 AI 续写的场景指令，用本书的设定来写，不要出现其他题材的元素。
4. 只在大纲已有的设定上展开，不要另造新的主线势力或谜团。

严格输出纯 JSON（无 markdown 反引号）：
{
  "characters": [{ "name": "角色名", "role": "身份定位", "key_action": "开篇关键行动", "inner_motivation": "深层动机" }],
  "world_elements": [{ "term": "设定名", "category": "力量体系", "description": "运作规则与代价" }],
  "techniques": [{ "category": "atmosphere", "name": "技法名", "description": "一句话说明", "prompt_template": "场景写作指令" }]
}`;

  const { act1, act2, act3 } = idea.three_act_beats;
  const userPrompt = `书名：${idea.title}\n题材：${idea.genre}\n金手指：${idea.golden_finger}\n核心冲突：${idea.main_conflict}\n【起】${act1}\n【承】${act2}\n【转合】${act3}`;

  const raw = await callLLM(config, systemPrompt, userPrompt, { signal });
  let parsed: unknown;
  try {
    parsed = extractAndParseJson<unknown>(raw);
  } catch {
    throw new Error('人物与设定生成结果解析失败，请重试');
  }
  const assets = normalizeIdeaAssets(parsed);
  if (!assets) throw new Error('人物与设定生成结果不完整（缺少人物或设定），请重试');
  return assets;
}
