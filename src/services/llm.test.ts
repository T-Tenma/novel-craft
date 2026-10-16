import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAndParseJson } from './llm.ts';
import { FAMOUS_AUTHOR_STYLES } from '../data/authorStyles.ts';

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
