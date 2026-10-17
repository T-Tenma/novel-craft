import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBrainwaveIdea,
  normalizeReviewReport,
  normalizeParagraphCritique,
  normalizeDiagnosis,
  normalizeConsistencyReport,
  normalizeParagraphAnalysis,
  normalizeChapterAnalysis,
} from './normalize.ts';

test('normalizeDiagnosis - keeps real scores (clamped) and requires both of them', () => {
  const d = normalizeDiagnosis({ match_score: '88', tension_score: 14, instant_feedback: ' 节奏紧 ' });
  assert.ok(d);
  assert.equal(d.match_score, 88);
  assert.equal(d.tension_score, 10);
  assert.equal(d.instant_feedback, '节奏紧');
  assert.equal(normalizeDiagnosis({ tension_score: 6 }), null, 'no invented 75% match score');
  assert.equal(normalizeDiagnosis('ok'), null);
});

test('normalizeConsistencyReport - requires a score and infers is_consistent from conflicts', () => {
  const r = normalizeConsistencyReport({
    consistency_score: 61,
    conflicts: [{ target: '林宵', problem_excerpt: '他飞了起来', rule_violated: '凡人不能飞', suggestion: '改成跳跃', type: 'world_rule_breach' }, 'junk'],
  });
  assert.ok(r);
  assert.equal(r.is_consistent, false);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].type, 'world_rule_breach');
  assert.equal(normalizeConsistencyReport({ is_consistent: true, overall_summary: '一致' }), null, 'no invented 90 score');
});

test('normalizeParagraphAnalysis - requires real commentary, never a canned comment', () => {
  const pa = normalizeParagraphAnalysis({ role_type: '危机转折', technique: '冷开场', editor_comment: '好' }, '痛！好痛！头部像是被一柄锈蚀的钝刀狠狠搅碎');
  assert.ok(pa);
  assert.equal(pa.role_type, '危机转折');
  assert.equal(pa.paragraph_excerpt, '痛！好痛！头部像是被一柄锈蚀的钝刀狠狠搅碎'.slice(0, 30));
  assert.equal(normalizeParagraphAnalysis({ role_type: '人物动作' }, '段落'), null);
  assert.equal(normalizeParagraphAnalysis({ editor_comment: '好', role_type: '奇怪的类型' }, '段落')?.role_type, '人物动作');
});

test('normalizeBrainwaveIdea - fills missing beats so the card can render', () => {
  const idea = normalizeBrainwaveIdea({ title: '赛博修真', golden_finger: '道经铜钱', three_act_beats: { act1: '起' } }, 'idea-1');
  assert.ok(idea);
  assert.deepEqual(idea.three_act_beats, { act1: '起', act2: '', act3: '' });
  assert.equal(idea.genre, '');
  assert.equal(idea.id, 'idea-1');
});

test('normalizeBrainwaveIdea - keeps an existing id and coerces non-string fields', () => {
  const idea = normalizeBrainwaveIdea({ id: 'demo-1', title: 42, main_conflict: '冲突', three_act_beats: 'oops' }, 'fallback');
  assert.ok(idea);
  assert.equal(idea.id, 'demo-1');
  assert.equal(idea.title, '');
  assert.deepEqual(idea.three_act_beats, { act1: '', act2: '', act3: '' });
});

test('normalizeBrainwaveIdea - rejects results with no usable content', () => {
  assert.equal(normalizeBrainwaveIdea(null, 'x'), null);
  assert.equal(normalizeBrainwaveIdea('text', 'x'), null);
  assert.equal(normalizeBrainwaveIdea({ genre: '只有题材' }, 'x'), null);
});

test('normalizeReviewReport - clamps scores and drops non-string list items', () => {
  const report = normalizeReviewReport({
    score_overall: '82',
    radar: { hook_strength: 130, pacing_tension: -5, character_arc: 70.6 },
    pros: ['节奏好', 3, ' '],
    cons: 'not a list',
  });
  assert.ok(report);
  assert.equal(report.score_overall, 82);
  // 模型漏给的维度保留为 null（界面显示「未评」），不编造 0 分
  assert.deepEqual(report.radar, { hook_strength: 100, pacing_tension: 0, character_arc: 71, curiosity_gap: null, trope_freshness: null });
  assert.deepEqual(report.pros, ['节奏好']);
  assert.deepEqual(report.cons, []);
  assert.deepEqual(report.revision_suggestions, []);
});

test('normalizeReviewReport - rejects reports without an overall score or radar instead of inventing one', () => {
  assert.equal(normalizeReviewReport({ radar: {}, pros: ['x'] }), null);
  assert.equal(normalizeReviewReport({ score_overall: 'high', radar: {} }), null);
  assert.equal(normalizeReviewReport({ score_overall: 80 }), null);
  assert.equal(normalizeReviewReport([]), null);
});

test('normalizeParagraphCritique - maps loose grades to a known grade and keeps the comment', () => {
  const item = normalizeParagraphCritique({ paragraph_text: '雨夜', grade: '硬伤：拖沓', editor_comment: '太慢' }, 3);
  assert.ok(item);
  assert.equal(item.grade, '硬伤·拖沓灌水');
  assert.equal(item.index, 3);
  assert.equal(item.rewrite_suggestion, undefined);
});

test('normalizeParagraphCritique - missing grade no longer crashes the drawer', () => {
  const item = normalizeParagraphCritique({ index: 1, paragraph_text: '雨夜', editor_comment: '不错', rewrite_suggestion: '改写' }, 9);
  assert.ok(item);
  assert.equal(item.grade, '合格·推进平稳');
  assert.equal(item.index, 1);
  assert.equal(item.rewrite_suggestion, '改写');
});

test('normalizeParagraphCritique - strips a leading label so adopting writes only the rewrite into the chapter', () => {
  const rewrite = (s: string) => normalizeParagraphCritique({ paragraph_text: '雨夜', editor_comment: '套话', rewrite_suggestion: s }, 1)?.rewrite_suggestion;
  assert.equal(rewrite('改写示范：油灯摇曳的暗影下，那对肢体违背常理。'), '油灯摇曳的暗影下，那对肢体违背常理。');
  assert.equal(rewrite('示范改写: 雨停了。'), '雨停了。');
  assert.equal(rewrite('【改写建议】：雨停了。'), '雨停了。');
  assert.equal(rewrite('他说：雨停了。'), '他说：雨停了。', 'dialogue colons in the prose stay');
  assert.equal(rewrite('改写示范：'), undefined, 'a bare label is no rewrite');
});

test('normalizeParagraphCritique - drops empty or malformed items', () => {
  assert.equal(normalizeParagraphCritique({ grade: '优秀' }, 1), null);
  assert.equal(normalizeParagraphCritique(undefined, 1), null);
});

test('normalizeChapterAnalysis - requires a summary and a tension score instead of inventing a 5', () => {
  assert.equal(normalizeChapterAnalysis({ summary: '主角醒来' }, '第一章'), null, 'no invented tension score');
  assert.equal(normalizeChapterAnalysis({ tension_score: 7 }, '第一章'), null, 'no invented summary');
  assert.equal(normalizeChapterAnalysis('not json', '第一章'), null);
});

test('normalizeChapterAnalysis - clamps tension to 1-10 and leaves optional text empty rather than canned', () => {
  const a = normalizeChapterAnalysis({ summary: ' 主角醒来 ', tension_score: '14' }, '第一章 绯红');
  assert.ok(a);
  assert.equal(a.tension_score, 10);
  assert.equal(a.summary, '主角醒来');
  assert.equal(a.chapter_title, '第一章 绯红');
  assert.equal(a.narrative_hook, '');
  assert.equal(a.technique_notes, '');
  assert.deepEqual(a.characters, []);
  assert.deepEqual(a.world_elements, []);
  assert.deepEqual(a.paragraph_analyses, []);
  assert.equal(normalizeChapterAnalysis({ summary: 's', tension_score: 0 }, 't')?.tension_score, 1);
});

test('normalizeChapterAnalysis - keeps only well-formed characters, settings and paragraph notes', () => {
  const a = normalizeChapterAnalysis({
    summary: 's',
    tension_score: 8,
    characters: [{ name: '克莱恩', role: '主角', status: '神秘状态', key_action: '占卜', inner_motivation: '回家' }, { role: '无名' }, 'junk'],
    world_elements: [{ term: '魔药', category: '力量体系', description: '序列' }, { term: '廷根', category: '城市' }, { category: '其他' }],
    paragraph_analyses: [
      { index: 2, role_type: '危机转折', purpose: '抛出危机', technique: '冷开场' },
      { index: 3, role_type: '环境氛围' },
      { index: 4, editor_comment: '好' },
    ],
  }, 't');
  assert.ok(a);
  assert.deepEqual(a.characters, [{ name: '克莱恩', role: '主角', status: '新登场', key_action: '占卜', inner_motivation: '回家' }]);
  assert.deepEqual(a.world_elements, [
    { term: '魔药', category: '力量体系', description: '序列' },
    { term: '廷根', category: '其他', description: '' },
  ]);
  assert.deepEqual(a.paragraph_analyses?.map((p) => [p.index, p.role_type, p.editor_comment]), [[2, '危机转折', ''], [4, '人物动作', '好']]);
});
