import { create } from 'zustand';
import { 
  NovelMetadata, 
  ChapterAnalysis, 
  BrainwaveIdea, 
  ReviewReport,
  CharacterItem,
  WorldElement,
  StoryVolume,
  StoryChapter,
  TechniquePrompt
} from '../types';
import { DEFAULT_PROMPT_ARSENAL } from '../data/promptArsenal';
import { FAMOUS_AUTHOR_STYLES, AuthorStyle } from '../data/authorStyles';

export type ActiveTab = 'deconstruct' | 'brainwave' | 'write' | 'review';

export interface BatchProgress {
  isRunning: boolean;
  isPaused: boolean;
  total: number;
  completed: number;
  currentTitle: string;
}

interface NovelState {
  // 当前激活的主视图
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // 小说元数据与正文 (研习原著)
  novel: NovelMetadata | null;
  setNovel: (novel: NovelMetadata | null) => void;
  selectedChapterId: number | null;
  setSelectedChapterId: (id: number | null) => void;

  // 单章拆解字典 (chapter_id -> Analysis)
  analyses: Record<number, ChapterAnalysis>;
  setChapterAnalysis: (chapterId: number, analysis: ChapterAnalysis) => void;
  setAllAnalyses: (all: Record<number, ChapterAnalysis>) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;

  // 全书原著聚合图谱 (研习参考物)
  globalCharacters: CharacterItem[];
  globalWorldElements: WorldElement[];
  updateGlobalAggregations: (analysis: ChapterAnalysis) => void;

  // 专属于创作者当前新书的资产 (可自由编辑维护)
  myCharacters: CharacterItem[];
  setMyCharacters: (chars: CharacterItem[]) => void;
  addMyCharacter: (char: CharacterItem) => void;
  updateMyCharacter: (index: number, char: CharacterItem) => void;
  deleteMyCharacter: (index: number) => void;

  myWorldElements: WorldElement[];
  setMyWorldElements: (elements: WorldElement[]) => void;
  addMyWorldElement: (element: WorldElement) => void;
  updateMyWorldElement: (index: number, element: WorldElement) => void;
  deleteMyWorldElement: (index: number) => void;

  // 多卷多章项目树与创作状态
  volumes: StoryVolume[];
  activeChapterId: string;
  setActiveChapterId: (chapterId: string) => void;
  createVolume: (title: string, desc?: string) => void;
  createChapter: (volumeId: string, title?: string) => void;
  updateChapterContent: (chapterId: string, content: string) => void;
  updateChapterTitle: (chapterId: string, title: string) => void;
  updateChapterStatus: (chapterId: string, status: 'draft' | 'completed' | 'published') => void;
  deleteChapter: (chapterId: string) => void;

  // 场景化名家技法 Prompt 武器库
  prompts: TechniquePrompt[];
  addPrompt: (prompt: TechniquePrompt) => void;

  // 🌟 名家文风矩阵（爱潜水的乌贼、季越人、熊狼狗、辰东、天蚕土豆）🌟
  authorStyles: AuthorStyle[];
  selectedAuthorStyleId: string;
  setSelectedAuthorStyleId: (id: string) => void;

  // 批量整书拆解调度状态
  batchProgress: BatchProgress;
  setBatchProgress: (progress: Partial<BatchProgress>) => void;
  batchConcurrency: number;
  setBatchConcurrency: (concurrency: number) => void;

  // 脑洞推演库
  ideas: BrainwaveIdea[];
  addIdea: (idea: BrainwaveIdea) => void;
  selectedIdeaId: string | null;
  setSelectedIdeaId: (id: string | null) => void;

  // 仿写草稿兼容字段 (指向当前活动章节)
  draftTitle: string;
  draftContent: string;
  setDraftTitle: (title: string) => void;
  setDraftContent: (content: string) => void;

  // 审稿报告
  reviewReport: ReviewReport | null;
  setReviewReport: (report: ReviewReport | null) => void;
  isReviewing: boolean;
  setIsReviewing: (reviewing: boolean) => void;

  // API 配置
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  setApiConfig: (baseUrl: string, key: string, model: string) => void;
}

const INITIAL_CHAPTER_CONTENT = `暴雨冲刷着九龙霓虹闪烁的仿生飞檐。

林宵抬起手，后颈的神经接口还在渗出带着机油味的淡银色冷却液。
在他面前破旧的铁皮工作台上，摆放着一台被熔断的义体烙铁，以及一枚冒着蓝绿色电弧的“铜钱”。

那不是普通的铜钱，铜钱的正反两面，用激光蚀刻着密集如电路板的道教《太上感应篇》符文。

“自杀？还是被算力贷公司灭口？”
林宵揉着剧痛的眉心，调出了视网膜前的系统界面。一行血红色的警报正在不断闪烁：
【警告：脑机神经熵值已达 89%，距化为‘赛博尸煞’还剩 47 小时】`;

export const useNovelStore = create<NovelState>((set, get) => ({
  activeTab: 'deconstruct',
  setActiveTab: (tab) => set({ activeTab: tab }),

  novel: null,
  setNovel: (novel) => set({ 
    novel, 
    selectedChapterId: novel && novel.chapters.length > 0 ? novel.chapters[0].id : null,
    analyses: {},
    globalCharacters: [],
    globalWorldElements: []
  }),
  selectedChapterId: null,
  setSelectedChapterId: (id) => set({ selectedChapterId: id }),

  analyses: {},
  setChapterAnalysis: (chapterId, analysis) => 
    set((state) => ({ analyses: { ...state.analyses, [chapterId]: analysis } })),
  setAllAnalyses: (all) => set({ analyses: all }),
  isAnalyzing: false,
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

  globalCharacters: [],
  globalWorldElements: [],
  updateGlobalAggregations: (analysis) =>
    set((state) => {
      const existingChars = [...state.globalCharacters];
      for (const ch of analysis.characters) {
        if (!existingChars.some((c) => c.name === ch.name)) {
          existingChars.push(ch);
        }
      }
      const existingWorlds = [...state.globalWorldElements];
      for (const we of analysis.world_elements) {
        if (!existingWorlds.some((w) => w.term === we.term)) {
          existingWorlds.push(we);
        }
      }
      return {
        globalCharacters: existingChars,
        globalWorldElements: existingWorlds,
      };
    }),

  // 我的新书人物资产
  myCharacters: [
    {
      name: '林宵',
      role: '男主角 / 贫民窟脑机散修',
      status: '新登场',
      key_action: '在脑机过载濒死时苏醒，发现体内寄生上古道经铜钱',
      inner_motivation: '在47小时脑机熵值化煞倒计时前活下去，查明前身死因'
    },
    {
      name: '玄通老道',
      role: '引路人 / 暗网黑市义体改造医修',
      status: '已有角色',
      key_action: '为主角提供初始抑制剂，私下推销走私道门符文芯片',
      inner_motivation: '寻求传说中的飞升算力核心，但自身义体已严重老化'
    }
  ],
  setMyCharacters: (chars) => set({ myCharacters: chars }),
  addMyCharacter: (char) => set((s) => ({ myCharacters: [...s.myCharacters, char] })),
  updateMyCharacter: (idx, char) =>
    set((s) => {
      const next = [...s.myCharacters];
      next[idx] = char;
      return { myCharacters: next };
    }),
  deleteMyCharacter: (idx) =>
    set((s) => ({ myCharacters: s.myCharacters.filter((_, i) => i !== idx) })),

  // 我的新书世界观资产
  myWorldElements: [
    {
      term: '太上感应铜钱',
      category: '力量体系',
      description: '激光蚀刻道教符文的量子运算核心，每次运转扣除人类情感算力值。'
    },
    {
      term: '九龙贫民窟·下层网络',
      category: '地理背景',
      description: '排污管道与高压光纤交织的无序地下城，被算力贷压垮的修士在此沦为赛博厉鬼。'
    }
  ],
  setMyWorldElements: (elements) => set({ myWorldElements: elements }),
  addMyWorldElement: (el) => set((s) => ({ myWorldElements: [...s.myWorldElements, el] })),
  updateMyWorldElement: (idx, el) =>
    set((s) => {
      const next = [...s.myWorldElements];
      next[idx] = el;
      return { myWorldElements: next };
    }),
  deleteMyWorldElement: (idx) =>
    set((s) => ({ myWorldElements: s.myWorldElements.filter((_, i) => i !== idx) })),

  // 多卷多章树状项目管理
  volumes: [
    {
      id: 'vol-1',
      title: '第一卷：数据道经与九龙夜雨',
      description: '主角在死局重生，破除算力贷灭口危机，初探暗网与宗门芯片',
      chapters: [
        {
          id: 'chap-1',
          title: '第一章：雨夜与脑机香火',
          content: INITIAL_CHAPTER_CONTENT,
          word_count: INITIAL_CHAPTER_CONTENT.replace(/\s+/g, '').length,
          status: 'draft',
          reference_chapter_id: 1,
        },
        {
          id: 'chap-2',
          title: '第二章：黑网追凶与玄通道人',
          content: '',
          word_count: 0,
          status: 'draft',
          reference_chapter_id: 2,
        },
      ],
    },
    {
      id: 'vol-2',
      title: '第二卷：财阀长生殿与赛博天劫',
      description: '进入大都市上层，接触长生财阀的核心机密',
      chapters: [
        {
          id: 'chap-3',
          title: '第一章：飞升许可证',
          content: '',
          word_count: 0,
          status: 'draft',
        },
      ],
    },
  ],
  activeChapterId: 'chap-1',
  setActiveChapterId: (chapterId) => {
    const state = get();
    for (const vol of state.volumes) {
      const ch = vol.chapters.find((c) => c.id === chapterId);
      if (ch) {
        set({
          activeChapterId: chapterId,
          draftTitle: ch.title,
          draftContent: ch.content,
        });
        return;
      }
    }
  },

  createVolume: (title, desc = '') =>
    set((s) => ({
      volumes: [
        ...s.volumes,
        {
          id: `vol-${Date.now()}`,
          title,
          description: desc,
          chapters: [],
        },
      ],
    })),

  createChapter: (volumeId, title = '新章节') =>
    set((s) => {
      const newChapId = `chap-${Date.now()}`;
      const newChap: StoryChapter = {
        id: newChapId,
        title,
        content: '',
        word_count: 0,
        status: 'draft',
      };
      const nextVols = s.volumes.map((v) => {
        if (v.id === volumeId) {
          return { ...v, chapters: [...v.chapters, newChap] };
        }
        return v;
      });
      return {
        volumes: nextVols,
        activeChapterId: newChapId,
        draftTitle: title,
        draftContent: '',
      };
    }),

  updateChapterContent: (chapterId, content) =>
    set((s) => {
      const nextVols = s.volumes.map((v) => ({
        ...v,
        chapters: v.chapters.map((c) => {
          if (c.id === chapterId) {
            return {
              ...c,
              content,
              word_count: content.replace(/\s+/g, '').length,
            };
          }
          return c;
        }),
      }));
      return {
        volumes: nextVols,
        draftContent: content,
      };
    }),

  updateChapterTitle: (chapterId, title) =>
    set((s) => {
      const nextVols = s.volumes.map((v) => ({
        ...v,
        chapters: v.chapters.map((c) => {
          if (c.id === chapterId) {
            return { ...c, title };
          }
          return c;
        }),
      }));
      return {
        volumes: nextVols,
        draftTitle: title,
      };
    }),

  updateChapterStatus: (chapterId, status) =>
    set((s) => ({
      volumes: s.volumes.map((v) => ({
        ...v,
        chapters: v.chapters.map((c) => {
          if (c.id === chapterId) {
            return { ...c, status };
          }
          return c;
        }),
      })),
    })),

  deleteChapter: (chapterId) =>
    set((s) => {
      const nextVols = s.volumes.map((v) => ({
        ...v,
        chapters: v.chapters.filter((c) => c.id !== chapterId),
      }));
      let firstAvailableId = '';
      for (const v of nextVols) {
        if (v.chapters.length > 0) {
          firstAvailableId = v.chapters[0].id;
          break;
        }
      }
      return {
        volumes: nextVols,
        activeChapterId: firstAvailableId,
      };
    }),

  // 场景化技法 Prompt 武器库
  prompts: DEFAULT_PROMPT_ARSENAL,
  addPrompt: (prompt) => set((s) => ({ prompts: [prompt, ...s.prompts] })),

  // 🌟 名家文风矩阵 🌟
  authorStyles: FAMOUS_AUTHOR_STYLES,
  selectedAuthorStyleId: 'wuzei', // 默认爱潜水的乌贼
  setSelectedAuthorStyleId: (id) => set({ selectedAuthorStyleId: id }),

  // 批量整书拆解调度状态
  batchProgress: {
    isRunning: false,
    isPaused: false,
    total: 0,
    completed: 0,
    currentTitle: '',
  },
  setBatchProgress: (progress) =>
    set((state) => ({ batchProgress: { ...state.batchProgress, ...progress } })),
  batchConcurrency: 2,
  setBatchConcurrency: (concurrency) => set({ batchConcurrency: concurrency }),

  ideas: [
    {
      id: 'demo-1',
      title: '赛博道门：数据飞升者',
      genre: '赛博朋克 + 东方古典克苏鲁',
      source_skeleton: '仿《诡秘之主》第一卷：死而复生破局 ➔ 窥见高维网络污染 ➔ 序列芯片植入',
      golden_finger: '植入古道门“天衍推演盘”，可侵入脑机接口解密功法，代价是每次推演扣除人类情感算力值',
      main_conflict: '大财阀垄断“长生香火”，贫民窟修士因算力贷化为数据厉鬼',
      three_act_beats: {
        act1: '程序员兼底层散修意外死于脑机超频，醒来发现自己体内寄生了上古道经残片。',
        act2: '加入暗网猎魔佣兵小队，猎杀财阀赛博魔傀，逐步炼化“筑基级网络协议”，发现恩师竟是污染源头。',
        act3: '面对全城神识降维打击，自毁情感中枢强开元神防火墙，舍身完成首次底层反攻。'
      }
    }
  ],
  addIdea: (idea) => set((state) => ({ ideas: [idea, ...state.ideas] })),
  selectedIdeaId: 'demo-1',
  setSelectedIdeaId: (id) => set({ selectedIdeaId: id }),

  draftTitle: '第一章：雨夜与脑机香火',
  draftContent: INITIAL_CHAPTER_CONTENT,
  setDraftTitle: (title) => {
    set({ draftTitle: title });
    const activeId = get().activeChapterId;
    if (activeId) {
      get().updateChapterTitle(activeId, title);
    }
  },
  setDraftContent: (content) => {
    set({ draftContent: content });
    const activeId = get().activeChapterId;
    if (activeId) {
      get().updateChapterContent(activeId, content);
    }
  },

  reviewReport: null,
  setReviewReport: (report) => set({ reviewReport: report }),
  isReviewing: false,
  setIsReviewing: (reviewing) => set({ isReviewing: reviewing }),

  apiBaseUrl: localStorage.getItem('novel_api_base') || 'http://127.0.0.1:8045',
  apiKey: localStorage.getItem('novel_api_key') || '',
  modelName: localStorage.getItem('novel_model_name') || 'gemini-3.8-flash-high',
  setApiConfig: (baseUrl, key, model) => {
    localStorage.setItem('novel_api_base', baseUrl);
    localStorage.setItem('novel_api_key', key);
    localStorage.setItem('novel_model_name', model);
    set({ apiBaseUrl: baseUrl, apiKey: key, modelName: model });
  },
}));
