import type { BrainwaveIdea } from '../types';
import { insertAt } from '../utils/collections.ts';

export interface IdeaRemoval {
  ideas: BrainwaveIdea[];
  selectedIdeaId: string | null;
}

// 删除脑洞：删掉的正是创作台引用的那条时清空选择，避免 AI 生成悄悄改用另一份设定
export function removeIdea(ideas: BrainwaveIdea[], ideaId: string, selectedIdeaId: string | null): IdeaRemoval {
  return {
    ideas: ideas.filter((i) => i.id !== ideaId),
    selectedIdeaId: selectedIdeaId === ideaId ? null : selectedIdeaId,
  };
}

// 撤销删除：放回原位置；该脑洞已存在时不重复插入
export function restoreIdeaAt(ideas: BrainwaveIdea[], index: number, idea: BrainwaveIdea): BrainwaveIdea[] {
  return ideas.some((i) => i.id === idea.id) ? ideas : insertAt(ideas, index, idea);
}

// 创作台参考的脑洞：只认明确选中的那条；没选中（或已被删除）就是没有，脑洞页与创作台共用同一规则
export function findSelectedIdea(ideas: BrainwaveIdea[], selectedIdeaId: string | null): BrainwaveIdea | null {
  return ideas.find((i) => i.id === selectedIdeaId) ?? null;
}

// 脑洞推演前的输入校验：题材与骨架都要填，否则模型只能凭空编造
export function validateBrainwaveInput(genre: string, skeleton: string): string | null {
  if (!genre.trim()) return '请先填写目标新题材，例如「诡异废土」「科幻末日修真」';
  if (!skeleton.trim()) return '请先填写要迁移的剧情骨架，可从拆解页「提炼模版」复制';
  return null;
}
