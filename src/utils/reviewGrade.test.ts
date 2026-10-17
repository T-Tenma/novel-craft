import test from 'node:test';
import assert from 'node:assert/strict';
import { getReviewGrade, formatRadarScore } from './reviewGrade.ts';

test('getReviewGrade - keeps the existing S threshold at 80', () => {
  assert.equal(getReviewGrade(100).tier, 'S');
  assert.equal(getReviewGrade(80).tier, 'S');
  assert.equal(getReviewGrade(80).headline, '👑 达到 S 级商业连载标准');
});

test('getReviewGrade - splits scores below 80 into bands instead of one optimistic label', () => {
  assert.equal(getReviewGrade(79).tier, 'A');
  assert.equal(getReviewGrade(70).tier, 'A');
  assert.equal(getReviewGrade(69).tier, 'B');
  assert.equal(getReviewGrade(60).tier, 'B');
  assert.equal(getReviewGrade(59).tier, 'C');
  assert.equal(getReviewGrade(0).tier, 'C');
});

test('getReviewGrade - a low score is never described as having publishing potential', () => {
  for (const score of [0, 20, 45, 59, 64]) {
    const { headline, summary } = getReviewGrade(score);
    assert.ok(!/出版|连载潜力/.test(headline + summary), `score ${score}: ${headline} / ${summary}`);
  }
});

test('getReviewGrade - every band has a summary that does not claim specific strengths', () => {
  for (const score of [95, 75, 65, 30]) {
    const { summary } = getReviewGrade(score);
    assert.ok(summary.length > 0);
    assert.ok(!summary.includes('核心悬念与开场危机推进明确'));
  }
});

test('formatRadarScore - a dimension the model did not score reads 未评, never 0', () => {
  assert.equal(formatRadarScore(72), '72 / 100');
  assert.equal(formatRadarScore(0), '0 / 100');
  assert.equal(formatRadarScore(null), '未评');
});
