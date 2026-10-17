import test from 'node:test';
import assert from 'node:assert/strict';
import { getConsistencyHeadline, CONFLICT_TYPE_LABELS } from './consistency.ts';

const conflict = { type: 'world_rule_breach' as const, target: '铜钱', problem_excerpt: '连开三次', rule_violated: '每次消耗情感', suggestion: '加代价' };

test('getConsistencyHeadline - passes only when the model found no conflict', () => {
  assert.equal(getConsistencyHeadline({ is_consistent: true, conflicts: [] }), '设定严密性通过');
});

test('getConsistencyHeadline - counts the conflicts so the writer knows how many to fix', () => {
  assert.equal(getConsistencyHeadline({ is_consistent: false, conflicts: [conflict, conflict] }), '发现 2 处设定冲突');
});

test('getConsistencyHeadline - says so when the model flags a conflict without listing where', () => {
  assert.equal(getConsistencyHeadline({ is_consistent: false, conflicts: [] }), '发现设定冲突（模型未列出具体位置）');
});

test('getConsistencyHeadline - a passing report that still lists items shows them as reminders', () => {
  assert.equal(getConsistencyHeadline({ is_consistent: true, conflicts: [conflict] }), '基本通过，有 1 处提醒');
});

test('CONFLICT_TYPE_LABELS - every conflict type has a Chinese label', () => {
  assert.deepEqual(CONFLICT_TYPE_LABELS, {
    character_conflict: '人设冲突',
    world_rule_breach: '设定违规',
    logic_plot_hole: '逻辑漏洞',
  });
});
