// 桌面版 SQLite 中人物 / 设定行（db_get_novel_report）到前端类型的转换
import type { CharacterItem, WorldElement } from '../types';

export interface CharacterRecordLike {
  name: string;
  role?: string | null;
  profile_json?: string | null;
}

export interface WorldElementRecordLike {
  term: string;
  category?: string | null;
  description?: string | null;
}

const WORLD_CATEGORIES: WorldElement['category'][] = ['力量体系', '地理背景', '法则规则', '势力派系', '其他'];

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function parseProfile(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// profile_json 是最近一次拆解写入的人物档案；库里不存登场状态，全书汇总统一视为「已有角色」
export function toCharacterItem(record: CharacterRecordLike): CharacterItem {
  const profile = parseProfile(record.profile_json);
  return {
    name: record.name,
    role: text(record.role) || text(profile.role),
    status: '已有角色',
    key_action: text(profile.key_action),
    inner_motivation: text(profile.inner_motivation),
  };
}

export function toWorldElement(record: WorldElementRecordLike): WorldElement {
  const category = text(record.category);
  return {
    term: record.term,
    category: WORLD_CATEGORIES.find((c) => c === category) ?? '其他',
    description: text(record.description),
  };
}
