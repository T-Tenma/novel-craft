import type { BrainwaveIdea, TechniquePrompt } from '../types';
import { insertAt } from '../utils/collections.ts';
import { IDEA_PROMPT_PREFIX } from '../data/promptArsenal.ts';

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
  if (!skeleton.trim()) return '请先填写要迁移的剧情骨架；拆解过原著时可点「填入拆解骨架」';
  return null;
}

// 脑洞页「迁移的剧情骨架」的示例；拆解过原著后可一键换成那本书的骨架
export const EXAMPLE_SKELETON =
  '参考《诡秘之主》第一卷模式：主角死局重生 ➔ 接触禁忌超自然组织 ➔ 获得带有反噬代价的金手指 ➔ 导师献祭与终局高潮';

// 采用新脑洞时本书技法排在最前，并替换上一份脑洞生成的那批；内置技法与其他自定义技法保留
export function withIdeaPrompts(prompts: TechniquePrompt[], ideaPrompts: TechniquePrompt[]): TechniquePrompt[] {
  return [...ideaPrompts, ...prompts.filter((p) => !p.id.startsWith(IDEA_PROMPT_PREFIX))];
}
