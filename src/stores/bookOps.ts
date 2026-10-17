// 一个项目里可能先后写几本书：首次启动的演示卷、上一本书、新采用的脑洞。这里处理书与书之间的边界
import type { BrainwaveIdea, CharacterItem, StoryVolume, WorldElement } from '../types';
import { DEMO_CHARACTERS, DEMO_VOLUMES, DEMO_WORLD_ELEMENTS } from './demoSeed.ts';

// 演示卷与种子完全一致（卷名、简介、章节、章名、正文与细纲都没动过）才算没改过，移除不会丢东西；作者的任何改动都保留
const demoFingerprint = (v: StoryVolume) => JSON.stringify([v.title, v.description, v.chapters.map((c) => [c.id, c.title, c.content, c.outline ?? ''])]);

function isUntouchedDemoVolume(volume: StoryVolume): boolean {
  const seed = DEMO_VOLUMES.find((d) => d.id === volume.id);
  return !!seed && demoFingerprint(seed) === demoFingerprint(volume);
}

const isDemoVolumeId = (id: string) => DEMO_VOLUMES.some((d) => d.id === id);

// 演示卷之外有章节，说明作者已经在写自己的书（只建了个空卷不算）
export function hasOwnChapters(volumes: StoryVolume[]): boolean {
  return volumes.some((v) => !isDemoVolumeId(v.id) && v.chapters.length > 0);
}

export function dropUntouchedDemoVolumes(volumes: StoryVolume[]): StoryVolume[] {
  return volumes.filter((v) => !isUntouchedDemoVolume(v));
}

export function hasDemoVolume(volumes: StoryVolume[]): boolean {
  return volumes.some((v) => isDemoVolumeId(v.id));
}

// 演示人物卡与设定（林宵、九龙贫民窟等）原样未改时移除；留着会进 AI 前情，给别的题材的书带进赛博设定
const isDemoCharacter = (c: CharacterItem) =>
  DEMO_CHARACTERS.some(
    (d) => d.name === c.name && d.role === c.role && d.status === c.status && d.key_action === c.key_action && d.inner_motivation === c.inner_motivation,
  );
const isDemoWorldElement = (w: WorldElement) =>
  DEMO_WORLD_ELEMENTS.some((d) => d.term === w.term && d.category === w.category && d.description === w.description);

export function dropUntouchedDemoCards(characters: CharacterItem[], worldElements: WorldElement[]) {
  return {
    characters: characters.filter((c) => !isDemoCharacter(c)),
    worldElements: worldElements.filter((w) => !isDemoWorldElement(w)),
  };
}

const ADOPTED_OUTLINE = /^【金手指】/; // 「采用此大纲立即仿写」写入的分卷简介
const IMITATION_PRACTICE = /^参考《.+》黄金开篇的仿写练习$/; // 「作为对照大纲直接仿写」新建的卷

// 老项目里的卷没有 starts_new_book：按新建时留下的痕迹推断哪一卷开始一本新书。只加标记、不去标记，重复执行结果不变
export function inferBookStarts(volumes: StoryVolume[], ideas: BrainwaveIdea[]): StoryVolume[] {
  const ideaVolumeTitles = new Set(ideas.map((i) => `《${i.title}》第一卷`));
  return volumes.map((v, i) => {
    if (i === 0 || v.starts_new_book) return v;
    const description = v.description.trim();
    const startsBook = ADOPTED_OUTLINE.test(description) || IMITATION_PRACTICE.test(description) || ideaVolumeTitles.has(v.title.trim());
    return startsBook ? { ...v, starts_new_book: true } : v;
  });
}

// 旧版「套用此骨架推演新脑洞」不调用模型，只塞一张写满占位套话的脑洞卡（id 以 idea-migrated- 开头）
const PLACEHOLDER_IDEA_PREFIX = 'idea-migrated-';

export function dropPlaceholderIdeas(ideas: BrainwaveIdea[], selectedIdeaId: string | null) {
  return {
    ideas: ideas.filter((i) => !i.id.startsWith(PLACEHOLDER_IDEA_PREFIX)),
    selectedIdeaId: selectedIdeaId?.startsWith(PLACEHOLDER_IDEA_PREFIX) ? null : selectedIdeaId,
  };
}
