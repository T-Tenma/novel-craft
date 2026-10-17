// 模型配置（BYOM）表单校验：「测试连通性」与「保存」共用同一套规则，避免测试通过但保存了无效配置。

export interface ModelConfigInput {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type ModelConfigField = keyof ModelConfigInput;

export interface ModelConfigValidation {
  value: ModelConfigInput; // 去掉首尾空格后的值
  errors: Partial<Record<ModelConfigField, string>>;
  warnings: Partial<Record<ModelConfigField, string>>;
  ok: boolean;
}

// 本机与局域网地址走 http 很常见（Ollama、本地反代），不提示明文风险
const LOCAL_HOST_PATTERNS = [
  /^localhost$/,
  /^127\./,
  /^\[?::1\]?$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.local$/,
];

function validateBaseUrl(baseUrl: string): { error?: string; warning?: string } {
  if (!baseUrl) return { error: '请填写 API Base URL' };
  if (!/^https?:\/\//i.test(baseUrl)) return { error: '地址需以 http:// 或 https:// 开头' };
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { error: '地址格式不正确，请检查后重试' };
  }
  if (!url.hostname) return { error: '地址格式不正确，请检查后重试' };
  const isLocal = LOCAL_HOST_PATTERNS.some((p) => p.test(url.hostname));
  if (url.protocol === 'http:' && !isLocal) {
    return { warning: '当前为 http 明文地址，API Key 会以明文发送，建议改用 https' };
  }
  return {};
}

export function validateModelConfig(input: ModelConfigInput): ModelConfigValidation {
  const value = { baseUrl: input.baseUrl.trim(), apiKey: input.apiKey.trim(), model: input.model.trim() };
  const errors: ModelConfigValidation['errors'] = {};
  const warnings: ModelConfigValidation['warnings'] = {};

  const url = validateBaseUrl(value.baseUrl);
  if (url.error) errors.baseUrl = url.error;
  if (url.warning) warnings.baseUrl = url.warning;

  if (!value.apiKey) errors.apiKey = '请填写 API Key（本地服务无需鉴权时可随意填写，如 ollama）';
  else if (/\s/.test(value.apiKey)) errors.apiKey = 'API Key 中不能包含空格';

  if (!value.model) errors.model = '请填写模型名称';

  return { value, errors, warnings, ok: Object.keys(errors).length === 0 };
}
