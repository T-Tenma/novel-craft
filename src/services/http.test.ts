import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTextWithRetry } from './http.ts';

type FakeFetch = (url: string, init: RequestInit) => Promise<Response>;

function withFetch(fake: FakeFetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fake as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const FAST = { retryBaseDelayMs: 1, timeoutMs: 1000 };

test('fetchTextWithRetry - retries 503 then returns the successful body', () =>
  withFetch(
    (() => {
      let calls = 0;
      return async () => (++calls === 1 ? new Response('busy', { status: 503 }) : new Response('{"ok":1}'));
    })(),
    async () => {
      const res = await fetchTextWithRetry('http://x', {}, FAST);
      assert.equal(res.ok, true);
      assert.equal(res.text, '{"ok":1}');
    },
  ));

test('fetchTextWithRetry - retries 429 and network errors, gives up after maxRetries', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return new Response('slow down', { status: 429 });
    },
    async () => {
      const res = await fetchTextWithRetry('http://x', {}, { ...FAST, maxRetries: 2 });
      assert.equal(res.status, 429);
      assert.equal(calls, 3);
    },
  );
});

test('fetchTextWithRetry - does not retry client errors like 401', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls++;
      return new Response('bad key', { status: 401 });
    },
    async () => {
      const res = await fetchTextWithRetry('http://x', {}, FAST);
      assert.equal(res.status, 401);
      assert.equal(res.text, 'bad key');
      assert.equal(calls, 1);
    },
  );
});

function hangingFetch(): FakeFetch {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
}

test('fetchTextWithRetry - times out a hanging request without retrying it', async () => {
  let calls = 0;
  const fake = hangingFetch();
  await withFetch(
    (url, init) => {
      calls++;
      return fake(url, init);
    },
    async () => {
      await assert.rejects(fetchTextWithRetry('http://x', {}, { ...FAST, timeoutMs: 30 }), /超时/);
      assert.equal(calls, 1);
    },
  );
});

test('fetchTextWithRetry - caller abort cancels the in-flight request', async () => {
  const controller = new AbortController();
  await withFetch(hangingFetch(), async () => {
    const pending = fetchTextWithRetry('http://x', {}, { ...FAST, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending, /取消/);
  });
});

test('fetchTextWithRetry - already-aborted signal never calls fetch', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  await withFetch(
    async () => {
      calls++;
      return new Response('x');
    },
    async () => {
      await assert.rejects(fetchTextWithRetry('http://x', {}, { ...FAST, signal: controller.signal }), /取消/);
      assert.equal(calls, 0);
    },
  );
});
