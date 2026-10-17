// 把模型接口的 HTTP / 网络错误翻译成用户看得懂、知道下一步怎么做的提示；保留截断后的服务端原文便于排查。

const DETAIL_MAX_LENGTH = 120;

function extractErrorDetail(rawText: string): string {
  let detail = rawText;
  try {
    const json = JSON.parse(rawText);
    detail = json?.error?.message || json?.message || rawText;
  } catch {
    // 非 JSON（如网关返回的 HTML）保留原文
  }
  const flat = String(detail).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > DETAIL_MAX_LENGTH ? `${flat.slice(0, DETAIL_MAX_LENGTH)}…` : flat;
}

export function describeHttpError(status: number, rawText: string): string {
  const detail = extractErrorDetail(rawText);
  const hint = detail ? `（服务端信息：${detail}）` : '';
  if (status === 401 || status === 403) {
    return `API Key 无效或没有访问权限（HTTP ${status}），请检查模型设置中的 API Key${hint}`;
  }
  if (status === 404) return `接口地址或模型名称不存在（HTTP 404），请检查 Base URL 和模型名称${hint}`;
  if (status === 413) return '发送的内容过长（HTTP 413），请缩短正文后重试';
  if (status === 429) return `请求太频繁或账户额度不足（HTTP 429），请稍后再试或检查额度${hint}`;
  if (status >= 500) return `模型服务暂时不可用（HTTP ${status}），已自动重试仍失败，请稍后再试${hint}`;
  return `模型服务拒绝了请求（HTTP ${status}）${hint || '，请检查模型名称与参数'}`;
}

export const NO_API_KEY_MESSAGE = '尚未配置模型，请先点击右上角「配置模型」填写 API Key';

// 「操作名 + 失败：原因」；原因里已经带了操作名（如「节奏诊断结果解析失败」）时不再重复前缀
export function formatActionError(action: string, message: string): string {
  if (!message) return `${action}失败，请重试`;
  return message.startsWith(action) ? message : `${action}失败：${message}`;
}

// fetch 在断网 / 地址不可达 / 被 CORS 拦截时抛 TypeError，各浏览器文案不同
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch|networkerror|load failed|fetch failed/i.test(err.message);
}

export function describeNetworkError(url: string): string {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // 保留原始地址
  }
  return `无法连接到模型服务（${host}）。请检查网络和 Base URL 是否正确；网页版还需要接口允许跨域访问（CORS）。`;
}
