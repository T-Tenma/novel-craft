import test from 'node:test';
import assert from 'node:assert/strict';
import { toProxiedUrl, routeThroughSiteProxy } from './corsProxy.ts';

const SITE = 'https://novel.tenma.top';

test('toProxiedUrl - v2ex chat endpoint goes through the same-origin proxy', () => {
  assert.equal(
    toProxiedUrl('https://edge.v2ex.com/chat/v1/chat/completions', SITE),
    'https://novel.tenma.top/llm-proxy/v2ex/chat/v1/chat/completions'
  );
});

test('toProxiedUrl - keeps the query string', () => {
  assert.equal(
    toProxiedUrl('https://edge.v2ex.com/chat/v1/models?x=1', SITE),
    'https://novel.tenma.top/llm-proxy/v2ex/chat/v1/models?x=1'
  );
});

test('toProxiedUrl - services that allow CORS are called directly', () => {
  for (const url of [
    'http://127.0.0.1:8045/v1/chat/completions',
    'https://api.openai.com/v1/chat/completions',
  ]) {
    assert.equal(toProxiedUrl(url, SITE), url);
  }
});

test('toProxiedUrl - only the chat API of v2ex is proxied, not the rest of the site', () => {
  for (const url of [
    'https://edge.v2ex.com/v1/chat/completions',
    'https://edge.v2ex.com/t/123',
    'http://edge.v2ex.com/chat/v1/chat/completions',
    'https://edge.v2ex.com.evil.example/chat/v1/chat/completions',
  ]) {
    assert.equal(toProxiedUrl(url, SITE), url);
  }
});

test('toProxiedUrl - an unparsable address is left alone for the normal error message', () => {
  assert.equal(toProxiedUrl('not a url', SITE), 'not a url');
});

test('routeThroughSiteProxy - outside a browser page (tests, desktop shell) calls directly', () => {
  assert.equal(
    routeThroughSiteProxy('https://edge.v2ex.com/chat/v1/chat/completions'),
    'https://edge.v2ex.com/chat/v1/chat/completions'
  );
});
