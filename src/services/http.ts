// 大模型 HTTP 请求：超时、调用方取消、对限流/网关错误的指数退避重试

export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export interface TextResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
}

export class RequestAbortError extends Error {
  reason: 'timeout' | 'cancelled';

  constructor(reason: 'timeout' | 'cancelled', message: string) {
    super(message);
    this.name = 'RequestAbortError';
    this.reason = reason;
  }
}

const cancelledError = () => new RequestAbortError('cancelled', '请求已取消');

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelledError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// 超时覆盖到响应体读取完成为止（非流式接口通常要等完整生成后才返回）
async function fetchTextOnce(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<TextResponse> {
  if (signal?.aborted) throw cancelledError();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, statusText: response.statusText, text };
  } catch (err) {
    if (timedOut) {
      throw new RequestAbortError('timeout', `请求超时：超过 ${Math.round(timeoutMs / 1000)} 秒未响应`);
    }
    if (signal?.aborted) throw cancelledError();
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

// 网络错误与 RETRYABLE_STATUS 会重试；超时与取消不重试，避免成倍拉长等待
export async function fetchTextWithRetry(
  url: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<TextResponse> {
  const {
    signal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  } = options;

  for (let attempt = 0; ; attempt++) {
    const isLastAttempt = attempt >= maxRetries;
    try {
      const res = await fetchTextOnce(url, init, signal, timeoutMs);
      if (isLastAttempt || !RETRYABLE_STATUS.has(res.status)) return res;
    } catch (err) {
      if (err instanceof RequestAbortError || isLastAttempt) throw err;
    }
    await sleep(retryBaseDelayMs * 2 ** attempt, signal);
  }
}
