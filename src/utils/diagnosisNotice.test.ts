import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosisFailureNotice } from './diagnosisNotice.ts';

test('diagnosisFailureNotice - a diagnosis the writer asked for reports the real error', () => {
  const notice = diagnosisFailureNotice(true, '请求超时');
  assert.equal(notice.tone, 'error');
  assert.match(notice.text, /节奏诊断/);
  assert.match(notice.text, /请求超时/);
});

test('diagnosisFailureNotice - the automatic check after a demo draft only leaves a mild hint', () => {
  const notice = diagnosisFailureNotice(false, '请求超时');
  assert.equal(notice.tone, 'info', 'must not look like the draft itself failed');
  assert.match(notice.text, /初稿已写入/);
  assert.match(notice.text, /「诊断」/);
});
