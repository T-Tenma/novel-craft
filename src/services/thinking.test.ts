import test from 'node:test';
import assert from 'node:assert/strict';
import { stripThinking } from './thinking.ts';

test('stripThinking - removes a reasoning block and keeps the prose with its paragraph breaks', () => {
  const raw = '<think>先铺垫危机，再抛钩子</think>\n\n雨下得很大。\n\n他推开了门。';
  assert.equal(stripThinking(raw), '雨下得很大。\n\n他推开了门。');
});

test('stripThinking - removes several blocks regardless of tag case', () => {
  assert.equal(stripThinking('<THINK>a</THINK>第一段<think>b</think>第二段'), '第一段第二段');
});

test('stripThinking - drops reasoning left before a dangling closing tag (proxy ate the opening tag)', () => {
  assert.equal(stripThinking('嗯，用户想要冷开场……\n</think>\n\n枪声响起。'), '枪声响起。');
});

test('stripThinking - an unfinished reasoning block yields nothing rather than leaking it into the chapter', () => {
  assert.equal(stripThinking('<think>还在想怎么写'), '');
});

test('stripThinking - leaves ordinary prose untouched', () => {
  const prose = '他想：think 这个词在旧日语言里另有含义。';
  assert.equal(stripThinking(`  ${prose}\n`), prose);
});
