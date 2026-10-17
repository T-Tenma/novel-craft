import test from 'node:test';
import assert from 'node:assert/strict';
import { describeHttpError, isNetworkError, describeNetworkError, formatActionError } from './llmErrors.ts';

test('formatActionError - prefixes the action name once', () => {
  assert.equal(formatActionError('续写', 'API Key 无效'), '续写失败：API Key 无效');
});

test('formatActionError - does not repeat the action when the message already names it', () => {
  assert.equal(formatActionError('节奏诊断', '节奏诊断结果解析失败，请重试'), '节奏诊断结果解析失败，请重试');
});

test('formatActionError - falls back to a generic message when the error has no text', () => {
  assert.equal(formatActionError('润色', ''), '润色失败，请重试');
});

test('describeHttpError - 401/403 point the user to the API key setting', () => {
  for (const status of [401, 403]) {
    const msg = describeHttpError(status, '{"error":{"message":"invalid api key"}}');
    assert.match(msg, /API Key/);
    assert.match(msg, /模型设置/);
    assert.match(msg, /invalid api key/, 'server detail is kept for troubleshooting');
  }
});

test('describeHttpError - 404 mentions base URL and model name', () => {
  assert.match(describeHttpError(404, 'Not Found'), /Base URL.*模型名称/);
});

test('describeHttpError - 429 and 5xx explain retry / quota', () => {
  assert.match(describeHttpError(429, ''), /稍后再试|额度/);
  assert.match(describeHttpError(503, '<html>Service Unavailable</html>'), /暂时不可用/);
});

test('describeHttpError - unknown statuses still show the status and a trimmed detail', () => {
  const msg = describeHttpError(400, JSON.stringify({ message: 'x'.repeat(500) }));
  assert.match(msg, /HTTP 400/);
  assert.ok(msg.length < 260, 'long server messages are truncated');
});

test('isNetworkError - recognises fetch network failures across browsers', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.')), true);
  assert.equal(isNetworkError(new TypeError('Load failed')), true);
  assert.equal(isNetworkError(new Error('请求超时：超过 120 秒未响应')), false);
});

test('describeNetworkError - names the host and mentions CORS for the web build', () => {
  const msg = describeNetworkError('http://127.0.0.1:8045/v1/chat/completions');
  assert.match(msg, /127\.0\.0\.1:8045/);
  assert.match(msg, /跨域|CORS/);
});
