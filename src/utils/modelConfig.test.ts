import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModelConfig } from './modelConfig.ts';

const VALID = { baseUrl: ' https://api.deepseek.com/v1 ', apiKey: ' sk-abc ', model: ' deepseek-chat ' };

test('validateModelConfig - trims values and accepts a complete config', () => {
  const v = validateModelConfig(VALID);
  assert.equal(v.ok, true);
  assert.deepEqual(v.value, { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-abc', model: 'deepseek-chat' });
  assert.deepEqual(v.errors, {});
  assert.deepEqual(v.warnings, {});
});

test('validateModelConfig - empty and whitespace-only fields are errors', () => {
  const v = validateModelConfig({ baseUrl: '', apiKey: '  ', model: '   ' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.baseUrl);
  assert.ok(v.errors.apiKey);
  assert.ok(v.errors.model);
});

test('validateModelConfig - base URL must be an http(s) URL', () => {
  assert.match(validateModelConfig({ ...VALID, baseUrl: 'api.deepseek.com/v1' }).errors.baseUrl ?? '', /http/);
  assert.match(validateModelConfig({ ...VALID, baseUrl: 'ftp://x.com' }).errors.baseUrl ?? '', /http/);
  assert.ok(validateModelConfig({ ...VALID, baseUrl: 'https://' }).errors.baseUrl);
  assert.equal(validateModelConfig({ ...VALID, baseUrl: 'http://127.0.0.1:8045' }).ok, true);
});

test('validateModelConfig - API key with inner spaces is rejected', () => {
  assert.ok(validateModelConfig({ ...VALID, apiKey: 'sk-abc def' }).errors.apiKey);
});

test('validateModelConfig - plain http to a remote host is allowed but warned about', () => {
  const v = validateModelConfig({ ...VALID, baseUrl: 'http://api.example.com/v1' });
  assert.equal(v.ok, true);
  assert.match(v.warnings.baseUrl ?? '', /明文/);
});

test('validateModelConfig - plain http to local or LAN hosts is not warned about', () => {
  for (const host of ['localhost:11434', '127.0.0.1:8045', '192.168.1.20:8000', '10.0.0.5', '172.20.1.1', 'my-box.local']) {
    assert.deepEqual(validateModelConfig({ ...VALID, baseUrl: `http://${host}/v1` }).warnings, {}, host);
  }
});
