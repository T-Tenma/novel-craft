const normalizeKey = (key: string) => key.trim().toLowerCase();

export const DEFAULT_NAME_MAX_LENGTH = 40;

// 撤销删除时把条目放回原位置（越界时放到首 / 尾）
export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

interface UniqueNameCheck {
  value: string;
  existing: string[];
  label: string; // 用于提示文案，如「角色姓名」
  excludeIndex?: number | null; // 编辑已有条目时排除自身
  maxLength?: number;
}

// 人物 / 设定 / 分卷等名称的统一校验：必填、长度上限、按忽略首尾空格与大小写去重。返回错误文案或 null
export function validateUniqueName({ value, existing, label, excludeIndex = null, maxLength = DEFAULT_NAME_MAX_LENGTH }: UniqueNameCheck): string | null {
  const name = value.trim();
  if (!name) return `请填写${label}`;
  if (name.length > maxLength) return `${label}不能超过 ${maxLength} 个字`;
  const key = normalizeKey(name);
  const duplicate = existing.some((other, i) => i !== excludeIndex && normalizeKey(other) === key);
  return duplicate ? `已存在同名的「${name}」，请换一个${label}` : null;
}

// 把 incoming 追加到 existing 之后，按 key（忽略首尾空格与大小写）去重；空 key 视为无效跳过
export function appendUniqueBy<T>(existing: T[], incoming: T[], keyOf: (item: T) => string) {
  const seen = new Set(existing.map((item) => normalizeKey(keyOf(item))));
  const additions: T[] = [];
  for (const item of incoming) {
    const key = normalizeKey(keyOf(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    additions.push(item);
  }
  return { items: [...existing, ...additions], added: additions.length, skipped: incoming.length - additions.length };
}
