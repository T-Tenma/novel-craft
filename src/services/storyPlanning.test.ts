import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeChapter, planChapters, suggestCardUpdates } from './storyPlanning.ts';
import { diagnoseDraftRealtime, expandStoryDraft, generateInspirationDraft } from './llm.ts';
import { hashText } from '../utils/chapterSummary.ts';

const CONFIG = { baseUrl: 'http://llm.test/v1', apiKey: 'k', model: 'm' };

// 回放模型回复，并记下发出去的 system / user 提示词
async function withModelReply(content: string, run: (sent: { system: string; user: string }[]) => Promise<void>) {
  const original = globalThis.fetch;
  const sent: { system: string; user: string }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ system: body.messages[0].content, user: body.messages[1].content });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await run(sent);
  } finally {
    globalThis.fetch = original;
  }
}

test('summarizeChapter - returns the summary stamped with the hash of the text it read', () =>
  withModelReply('{"summary":"陈逢青进城。","state_changes":["纸雀归陈逢青"]}', async (sent) => {
    const summary = await summarizeChapter(CONFIG, { title: '第四章 进城', content: '正文。', storyContext: '【人物设定】\n- 陈逢青' });
    assert.deepEqual(summary, { text: '陈逢青进城。', state_changes: ['纸雀归陈逢青'], content_hash: hashText('正文。') });
    assert.match(sent[0].user, /第四章 进城[\s\S]*正文。/);
    assert.match(sent[0].user, /陈逢青/);
  }));

test('summarizeChapter - an unusable reply is an error to retry, not an empty summary', () =>
  withModelReply('抱歉，我无法完成。', async () => {
    await assert.rejects(() => summarizeChapter(CONFIG, { title: 't', content: '正文', storyContext: '' }), /请重试/);
  }));

test('planChapters - tells the model where numbering starts, what is planned already and the direction', () =>
  withModelReply('{"chapters":[{"title":"第四章 进城","outline":"进城\\n章末：落锁"}]}', async (sent) => {
    const plans = await planChapters(CONFIG, {
      count: 3,
      startNumber: 4,
      bookOutline: '书名《扎彩客》',
      volumeOutline: '中元夜揭穿换命局',
      storyContext: '【前情提要】\n- 第一章',
      existingOutlines: ['原定：城隍庙对峙'],
      direction: '节奏放慢',
    });
    assert.deepEqual(plans, [{ title: '第四章 进城', outline: '进城\n章末：落锁' }]);
    const prompt = sent[0].user;
    for (const part of ['3 章', '第 4 章', '书名《扎彩客》', '中元夜揭穿换命局', '【前情提要】', '原定：城隍庙对峙', '节奏放慢']) {
      assert.ok(prompt.includes(part), `prompt includes ${part}`);
    }
  }));

test('planChapters - no usable chapter in the reply is an error to retry', () =>
  withModelReply('{"chapters":[]}', async () => {
    await assert.rejects(
      () => planChapters(CONFIG, { count: 3, startNumber: 1, bookOutline: '', volumeOutline: '', storyContext: '', existingOutlines: [], direction: '' }),
      /请重试/,
    );
  }));

test('suggestCardUpdates - sends the cards and the recap; an empty list means the cards are up to date', () =>
  withModelReply('{"updates":[]}', async (sent) => {
    const list = await suggestCardUpdates(CONFIG, {
      characters: [{ name: '沈管事', status: '已有角色', role: '管事', key_action: '', inner_motivation: '' }],
      worldElements: [],
      recap: '【前情提要】\n- 第五章：沈管事身亡',
    });
    assert.deepEqual(list, []);
    assert.match(sent[0].user, /沈管事[\s\S]*第五章：沈管事身亡/);
  }));

test('diagnoseDraftRealtime - with a chapter outline it asks which beats are still missing', () =>
  withModelReply('{"match_score":80,"tension_score":7,"outline_gaps":["城门落锁"]}', async (sent) => {
    const d = await diagnoseDraftRealtime(CONFIG, '正文', '参考', '进城；章末：城门落锁');
    assert.deepEqual(d.outline_gaps, ['城门落锁']);
    assert.equal(d.checked_outline, '进城；章末：城门落锁', 'the result remembers which outline it checked');
    assert.match(sent[0].user, /【本章细纲】[\s\S]*城门落锁/);
    assert.match(sent[0].system, /outline_gaps/);
  }));

test('diagnoseDraftRealtime - without an outline the prompt does not mention one', () =>
  withModelReply('{"match_score":80,"tension_score":7}', async (sent) => {
    const d = await diagnoseDraftRealtime(CONFIG, '正文', '参考');
    assert.equal(d.checked_outline, undefined);
    assert.doesNotMatch(sent[0].user + sent[0].system, /细纲/);
  }));

test('sample draft and continuation - follow the chapter outline and leave the next one alone', async () => {
  await withModelReply('正文', async (sent) => {
    await generateInspirationDraft(CONFIG, '第二章', '参考节拍', '', undefined, '【本章细纲】\n进城');
    await expandStoryDraft(CONFIG, '上文', '顺着写', undefined, '【本章细纲】\n进城');
    for (const { system } of sent) {
      assert.match(system, /【本章细纲】/);
      assert.match(system, /【下一章细纲】/);
    }
    // 续写总会带一句默认指令（顺着局势推进 + 文风），细纲不能只在「没有指令」时才生效
    assert.match(sent[1].system, /只写[^。]*下一个节拍[^。]*不要一口气/);
    assert.doesNotMatch(sent[1].system, /没有作者指令/);
    assert.match(sent[0].system, /章末落点优先/);
  });
});

test('planChapters - asks for beats as a list, so outlines never need raw newlines inside JSON strings', () =>
  withModelReply('{"chapters":[{"title":"第四章 进城","outline":["进城","章末：落锁"]}]}', async (sent) => {
    const plans = await planChapters(CONFIG, { count: 1, startNumber: 4, bookOutline: '', volumeOutline: '', storyContext: '', existingOutlines: [], direction: '' });
    assert.deepEqual(plans, [{ title: '第四章 进城', outline: '进城\n章末：落锁' }]);
    assert.match(sent[0].system, /"outline": \[/);
  }));

