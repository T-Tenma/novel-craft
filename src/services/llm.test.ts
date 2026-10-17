import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAndParseJson,
  analyzeSelectedParagraph,
  critiqueDraftParagraphsWithLLM,
  diagnoseDraftRealtime,
  checkDraftConsistency,
  expandStoryDraft,
  generateInspirationDraft,
  polishStoryDraft,
} from './llm.ts';
import { FAMOUS_AUTHOR_STYLES } from '../data/authorStyles.ts';

const CONFIG = { baseUrl: 'http://llm.test/v1', apiKey: 'k', model: 'm' };

async function withModelReply(content: string, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

// 解析失败时必须报错，不能返回写死的「优秀 / 75% / 通过 90 分」等假结果
const UNPARSEABLE = '抱歉，我无法完成这个请求。';
const fakeResultCases: Array<[string, () => Promise<unknown>]> = [
  ['analyzeSelectedParagraph', () => analyzeSelectedParagraph(CONFIG, '痛！好痛！', '上下文')],
  ['critiqueDraftParagraphsWithLLM', () => critiqueDraftParagraphsWithLLM(CONFIG, '第一段。\n第二段。')],
  ['diagnoseDraftRealtime', () => diagnoseDraftRealtime(CONFIG, '正文', '参考')],
  ['checkDraftConsistency', () => checkDraftConsistency(CONFIG, '正文', [], [])],
];

for (const [name, call] of fakeResultCases) {
  test(`${name} - rejects instead of returning a canned result when the reply is not JSON`, () =>
    withModelReply(UNPARSEABLE, async () => {
      await assert.rejects(call, /请重试/);
    }));
}

test('callLLM-based features - an HTTP 401 surfaces an actionable message instead of the raw status', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(() => diagnoseDraftRealtime(CONFIG, '正文', '参考'), /API Key.*模型设置/);
  } finally {
    globalThis.fetch = original;
  }
});

test('diagnoseDraftRealtime - JSON without scores is rejected too', () =>
  withModelReply('{"instant_feedback":"不错"}', async () => {
    await assert.rejects(() => diagnoseDraftRealtime(CONFIG, '正文', '参考'), /请重试/);
  }));

test('critiqueDraftParagraphsWithLLM - a valid reply is returned as-is (normalized)', () =>
  withModelReply('[{"paragraph_text":"第一段","grade":"优秀·黄金段","editor_comment":"好"}]', async () => {
    const list = await critiqueDraftParagraphsWithLLM(CONFIG, '第一段。');
    assert.equal(list.length, 1);
    assert.equal(list[0].editor_comment, '好');
  }));

test('extractAndParseJson - parses standard JSON object', () => {
  const input = '{"title":"测试小说","score":95}';
  const result = extractAndParseJson(input);
  assert.equal(result.title, '测试小说');
  assert.equal(result.score, 95);
});

test('extractAndParseJson - extracts JSON from markdown code block', () => {
  const input = '```json\n{"summary":"核心情节","tension_score":8}\n```';
  const result = extractAndParseJson(input);
  assert.equal(result.summary, '核心情节');
  assert.equal(result.tension_score, 8);
});

test('extractAndParseJson - strips DeepSeek-R1 <think> block and conversational chatter', () => {
  const input = `
<think>
思考中：首先需要分析小说开篇节奏，然后再输出标准JSON格式。
用户想要的是纯JSON对象。
</think>
这里是你要的拆解结果：
\`\`\`json
{
  "summary": "死局重生，直面诡异",
  "hook": "47小时倒计时"
}
\`\`\`
希望对你有帮助！`;

  const result = extractAndParseJson(input);
  assert.equal(result.summary, '死局重生，直面诡异');
  assert.equal(result.hook, '47小时倒计时');
});

test('extractAndParseJson - recovers raw JSON bracket when code fence is omitted', () => {
  const input = '经过思考，分析结果如下：{"match_score":88,"status":"ok"} 祝创作愉快。';
  const result = extractAndParseJson(input);
  assert.equal(result.match_score, 88);
  assert.equal(result.status, 'ok');
});

test('extractAndParseJson - uses fallback when JSON is malformed', () => {
  const input = '这是一段完全无法解析为JSON的普通文本。';
  const fallback = { fallback: true };
  const result = extractAndParseJson(input, fallback);
  assert.deepEqual(result, fallback);
});

test('FAMOUS_AUTHOR_STYLES - has valid entries and guidelines', () => {
  assert.ok(FAMOUS_AUTHOR_STYLES.length >= 5);
  for (const author of FAMOUS_AUTHOR_STYLES) {
    assert.ok(author.id);
    assert.ok(author.name);
    assert.ok(author.stylistic_guideline.length > 50);
  }
});

// 截获发给模型的请求，检查提示词里真正带了什么
async function captureRequest(reply: string, run: () => Promise<unknown>) {
  const original = globalThis.fetch;
  let body: { messages: Array<{ content: string }> } | null = null;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await run();
    assert.ok(body, 'request was sent');
    const sent = body as { messages: Array<{ content: string }> };
    return { result, system: sent.messages[0].content, user: sent.messages[1].content };
  } finally {
    globalThis.fetch = original;
  }
}

const STORY_CONTEXT = '【前一章《第一章》结尾】\n门外的手指抠了进来。';

test('expandStoryDraft - sends the story context and the author direction, and no longer asks for a new conflict every time', async () => {
  const { system, user } = await captureRequest('续写正文', () =>
    expandStoryDraft(CONFIG, '上文', '让裴照先开口摊牌', undefined, STORY_CONTEXT));
  assert.match(user, /门外的手指抠了进来/);
  assert.match(user, /让裴照先开口摊牌/);
  assert.doesNotMatch(system, /埋下一个细微线索或冲突加剧点/);
  assert.match(system, /不要[^。]*新势力/);
});

test('generateInspirationDraft - a later chapter picks up from the previous one', async () => {
  const { system, user } = await captureRequest('初稿', () =>
    generateInspirationDraft(CONFIG, '第二章', '节拍', '', undefined, STORY_CONTEXT));
  assert.match(user, /门外的手指抠了进来/);
  assert.match(system, /接上前一章/);
});

test('generateInspirationDraft - no forced cliffhanger and no new factions, so a finale can wrap up', async () => {
  const { system } = await captureRequest('初稿', () =>
    generateInspirationDraft(CONFIG, '第六章', '节拍', '', undefined, STORY_CONTEXT));
  assert.doesNotMatch(system, /必须留下[^。]*致命悬念/);
  assert.match(system, /收束[^。]*不要[^。]*新局/);
  assert.match(system, /不要[^。]*新势力/);
});

test('polishStoryDraft - pins the length and the proper nouns of the original', async () => {
  const { system, user } = await captureRequest('润色稿', () => polishStoryDraft(CONFIG, '字'.repeat(2000)));
  assert.match(system + user, /2000 字/);
  assert.match(system, /1700[^0-9]+2300/);
  assert.match(system, /人名[^。]*时间[^。]*不得改动/);
});

test('diagnoseDraftRealtime - a long chapter is judged with its ending, not only its first 2000 characters', async () => {
  const draft = '开头'.repeat(1500) + '这是章末的钩子。';
  const { user } = await captureRequest(JSON.stringify({ match_score: 80, tension_score: 7, instant_feedback: 'ok' }), () =>
    diagnoseDraftRealtime(CONFIG, draft, '参考'));
  assert.match(user, /这是章末的钩子。/);
  assert.match(user, /共 3008 字/);
});

test('diagnoseDraftRealtime - a calm ending is judged as an ending, not praised as a cliffhanger', async () => {
  const { system } = await captureRequest(JSON.stringify({ match_score: 80, tension_score: 4, instant_feedback: 'ok' }), () =>
    diagnoseDraftRealtime(CONFIG, '尾声。', '参考'));
  assert.match(system, /平静收尾[^。]*不要[^。]*悬念/);
});

test('checkDraftConsistency - sends character status so the dead are not brought back', async () => {
  const characters = [{ name: '冷面剑卫', status: '退场/阵亡', role: '剑卫', inner_motivation: '', key_action: '' }];
  const { system, user } = await captureRequest(JSON.stringify({ consistency_score: 90, conflicts: [] }), () =>
    checkDraftConsistency(CONFIG, '剑卫又提剑杀来。', characters, []));
  assert.match(user, /退场\/阵亡/);
  assert.match(system, /退场\/阵亡[^。]*不应/);
  assert.match(system, /退场之前[^。]*不算冲突/, 'status is the latest state, so re-checking an earlier chapter does not flag the living character');
});

test('checkDraftConsistency - checks the end of long chapters and tells the model what came before', async () => {
  const draft = '甲'.repeat(7000) + '最后一段出了问题。';
  const { system, user } = await captureRequest(JSON.stringify({ consistency_score: 90, conflicts: [] }), () =>
    checkDraftConsistency(CONFIG, draft, [], [], STORY_CONTEXT));
  assert.match(user, /最后一段出了问题。/);
  assert.match(user, /门外的手指抠了进来/);
  assert.match(system, /前文/);
});

test('critiqueDraftParagraphsWithLLM - a later batch critiques the next paragraphs and keeps chapter-wide numbering', async () => {
  const draft = Array.from({ length: 25 }, (_, i) => `第${i + 1}段内容。`).join('\n');
  const reply = JSON.stringify([{ index: 1, paragraph_text: '第11段内容。', grade: '合格', editor_comment: '平' }]);
  const { result, user } = await captureRequest(reply, () => critiqueDraftParagraphsWithLLM(CONFIG, draft, '', undefined, 10));
  assert.match(user, /第11段内容。/);
  assert.match(user, /第20段内容。/);
  assert.doesNotMatch(user, /第10段内容。|第21段内容。/);
  assert.equal((result as Array<{ index: number }>)[0].index, 11);
});

test('critiqueDraftParagraphsWithLLM - out-of-range or repeated model indexes fall back to reply order, so batches never collide', async () => {
  const draft = Array.from({ length: 25 }, (_, i) => `第${i + 1}段内容。`).join('\n');
  const reply = JSON.stringify([
    { index: 0, paragraph_text: '第11段内容。', grade: '合格', editor_comment: '零起编号' },
    { index: 15, paragraph_text: '第12段内容。', grade: '合格', editor_comment: '用了全章段号' },
    { index: 3, paragraph_text: '第13段内容。', grade: '合格', editor_comment: '正常' },
    { index: 3, paragraph_text: '第14段内容。', grade: '合格', editor_comment: '重复' },
  ]);
  const { result } = await captureRequest(reply, () => critiqueDraftParagraphsWithLLM(CONFIG, draft, '', undefined, 10));
  const indexes = (result as Array<{ index: number }>).map((r) => r.index);
  assert.deepEqual(indexes, [11, 12, 13, 14]);
});

test('critiqueDraftParagraphsWithLLM - rewrites see the story settings and must keep the facts of the paragraph', async () => {
  const reply = JSON.stringify([{ index: 1, paragraph_text: '第一段。', grade: '合格', editor_comment: '平' }]);
  const { system, user } = await captureRequest(reply, () =>
    critiqueDraftParagraphsWithLLM(CONFIG, '第一段。', '', undefined, 0, STORY_CONTEXT));
  assert.match(user, /门外的手指抠了进来/);
  assert.match(system, /人名[^。]*数字[^。]*规则[^。]*照原段/);
  assert.match(system, /原段没有的[^。]*不要添/);
});
