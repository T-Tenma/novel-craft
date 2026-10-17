// 创作者项目（卷/章/人设/脑洞/偏好）的本地持久化规则。原著正文与拆解走 services/db.ts，不在这里。
import type { TechniquePrompt } from '../types';
import type { NovelState } from './novelStore';
import { DEFAULT_PROMPT_ARSENAL } from '../data/promptArsenal.ts';
import { resolveActiveDraft } from './chapterOps.ts';
import { normalizeBrainwaveIdea } from '../services/normalize.ts';

export const PERSIST_STORAGE_KEY = 'novel_craft_project';
export const PERSIST_VERSION = 1;

// draftTitle/draftContent 不单独存：它们是活动章节的镜像，恢复时从 volumes 推导，避免正文存两份
const PERSISTED_KEYS = [
  'volumes',
  'activeChapterId',
  'myCharacters',
  'myWorldElements',
  'ideas',
  'selectedIdeaId',
  'selectedAuthorStyleId',
  'batchConcurrency',
  'lastOpenedNovel', // 只存文件名，启动时从书库存储重新载入正文（见 App.tsx）
] as const;

type PersistedKey = (typeof PERSISTED_KEYS)[number];
export type PersistedNovelState = Pick<NovelState, PersistedKey> & { customPrompts: TechniquePrompt[] };

const DEFAULT_PROMPT_IDS = new Set(DEFAULT_PROMPT_ARSENAL.map((p) => p.id));

export function partializeNovelState(state: NovelState): PersistedNovelState {
  const picked = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, state[k]])) as Pick<NovelState, PersistedKey>;
  // 只存用户新增的技法；内置技法以代码为准，升级后自动生效
  return { ...picked, customPrompts: state.prompts.filter((p) => !DEFAULT_PROMPT_IDS.has(p.id)) };
}

function sameShape(value: unknown, reference: unknown): boolean {
  if (value === null || reference === null) return true;
  if (Array.isArray(reference)) return Array.isArray(value);
  return typeof value === typeof reference;
}

export function mergePersistedState(persisted: unknown, current: NovelState): NovelState {
  if (!persisted || typeof persisted !== 'object') return current;
  const saved = persisted as Partial<PersistedNovelState>;

  const restored = Object.fromEntries(
    PERSISTED_KEYS.filter((k) => k in saved && sameShape(saved[k], current[k])).map((k) => [k, saved[k]]),
  );
  const customPrompts = Array.isArray(saved.customPrompts) ? saved.customPrompts : [];
  // 旧版本可能存下了结构残缺的脑洞（缺 three_act_beats 等），恢复时修补或丢弃，避免脑洞页反复崩溃
  if (Array.isArray(restored.ideas)) {
    restored.ideas = (restored.ideas as unknown[])
      .map((idea, i) => normalizeBrainwaveIdea(idea, `idea-restored-${i}`))
      .filter((idea) => idea !== null);
  }
  const next = { ...current, ...restored, prompts: [...customPrompts, ...DEFAULT_PROMPT_ARSENAL] };
  return { ...next, ...resolveActiveDraft(next.volumes, next.activeChapterId) };
}

interface SyncStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

// localStorage 写满或不可用时不能让 set() 抛错打断输入；只在 失败/恢复 状态切换时通知一次
export function createSafeStorage(base: SyncStorage, onWriteStatus: (error: Error | null) => void): SyncStorage {
  let failing = false;
  return {
    getItem: (name) => {
      try {
        return base.getItem(name);
      } catch (err) {
        console.error('读取本地项目存档失败', err);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        base.setItem(name, value);
        if (failing) {
          failing = false;
          onWriteStatus(null);
        }
      } catch (err) {
        if (!failing) {
          failing = true;
          onWriteStatus(err instanceof Error ? err : new Error(String(err)));
        }
      }
    },
    removeItem: (name) => {
      try {
        base.removeItem(name);
      } catch (err) {
        console.error('删除本地项目存档失败', err);
      }
    },
  };
}
