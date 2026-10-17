import React, { useCallback, useState } from 'react';
import { useNovelStore } from '../../stores/novelStore';
import { findSelectedIdea, validateBrainwaveInput } from '../../stores/ideaOps';
import { EditorNotice, UNDO_NOTICE_MS, type EditorNoticeState } from '../editor/EditorNotice';
import { generateBrainwaveWithLLM } from '../../services/llm';
import { NO_API_KEY_MESSAGE, formatActionError } from '../../services/llmErrors';
import { Sparkles, ArrowRight, Wand2, Compass, Target, List, FileText, Trash2 } from 'lucide-react';
import type { BrainwaveIdea } from '../../types';

function buildIdeaOutline(idea: BrainwaveIdea): string {
  const { act1, act2, act3 } = idea.three_act_beats;
  return `【金手指】${idea.golden_finger}\n【核心冲突】${idea.main_conflict}\n【起】${act1}\n【承】${act2}\n【转合】${act3}`;
}

export const BrainwaveView: React.FC = () => {
  const { 
    ideas, 
    addIdea, 
    deleteIdea,
    selectedIdeaId, 
    setSelectedIdeaId,
    apiBaseUrl, 
    apiKey, 
    modelName,
    setActiveTab,
    createVolume,
    createChapter
  } = useNovelStore();

  const [genreInput, setGenreInput] = useState('赛博朋克 + 东方修真克苏鲁');
  const [skeletonInput, setSkeletonInput] = useState(
    '参考《诡秘之主》第一卷模式：主角死局重生 ➔ 接触禁忌超自然组织 ➔ 获得带有反噬代价的金手指 ➔ 导师献祭与终局高潮'
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState<EditorNoticeState | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  // 🌟 手机端视图分段切换: 'generator' (创意生成与列表) | 'detail' (灵感卡片详述) 🌟
  const [mobileTab, setMobileTab] = useState<'generator' | 'detail'>('generator');

  // 与创作台同一规则：只展示明确选中的脑洞，不拿第一条顶替（否则看似选中，创作台却没有参考它）
  const currentIdea = findSelectedIdea(ideas, selectedIdeaId);

  const handleGenerate = async () => {
    const inputError = validateBrainwaveInput(genreInput, skeletonInput);
    if (inputError) {
      setErrorMsg(inputError);
      return;
    }
    if (!apiKey) {
      setErrorMsg(NO_API_KEY_MESSAGE);
      return;
    }

    setIsGenerating(true);
    setErrorMsg('');
    try {
      const newIdea = await generateBrainwaveWithLLM(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        genreInput,
        skeletonInput
      );
      addIdea(newIdea);
      setSelectedIdeaId(newIdea.id);
      if (window.innerWidth < 768) {
        setMobileTab('detail');
      }
    } catch (err: any) {
      setErrorMsg(formatActionError('脑洞推演', err.message));
    } finally {
      setIsGenerating(false);
    }
  };

  // 新建一卷承载这份大纲，不覆盖已有章节；选中该脑洞后，创作台的 AI 生成会带上它的设定
  const handleUseIdeaForWriting = (idea: typeof currentIdea) => {
    if (!idea) return;
    const volumeId = createVolume(`《${idea.title}》第一卷`, buildIdeaOutline(idea));
    createChapter(volumeId, '第一章');
    setSelectedIdeaId(idea.id);
    setActiveTab('write');
  };

  // 与章节 / 分卷一致：删除不弹确认，改为可撤销
  const handleDeleteIdea = (idea: BrainwaveIdea) => {
    const index = ideas.findIndex((i) => i.id === idea.id);
    if (index < 0) return;
    const wasSelected = selectedIdeaId === idea.id;
    deleteIdea(idea.id);
    setNotice({
      tone: 'info',
      text: `已删除脑洞「${idea.title}」`,
      durationMs: UNDO_NOTICE_MS,
      action: {
        label: '撤销',
        onClick: () => {
          useNovelStore.getState().restoreIdea(index, idea, wasSelected);
          setNotice(null);
        },
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-zinc-950 text-zinc-100 pb-mobile-nav md:pb-0">
      {/* 🌟 手机端顶部视图分段切换器 🌟 */}
      <div className="md:hidden flex items-center justify-around bg-zinc-900 border-b border-zinc-800 p-1.5 shrink-0 z-20">
        <button
          onClick={() => setMobileTab('generator')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            mobileTab === 'generator' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>创意库 & 推演 ({ideas.length})</span>
        </button>

        <button
          onClick={() => setMobileTab('detail')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            mobileTab === 'detail' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>卡片详述</span>
        </button>
      </div>

      {/* 1. 左侧已有灵感脑洞列表 (手机端受 mobileTab 控制，桌面端固定展示) */}
      <aside className={`w-full md:w-80 border-r border-zinc-800 bg-zinc-900/40 flex-col shrink-0 ${
        mobileTab === 'generator' ? 'flex' : 'hidden md:flex'
      }`}>
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-zinc-200">灵感脑洞库</span>
          </div>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
            {ideas.length} 个创意
          </span>
        </div>

        {/* 预设生成表单 */}
        <div className="p-3 border-b border-zinc-800/80 bg-zinc-950/60 space-y-2.5 text-xs">
          <div>
            <label htmlFor="brainwave-genre" className="block text-[11px] font-medium text-zinc-400 mb-1">目标新题材</label>
            <input
              id="brainwave-genre"
              type="text"
              value={genreInput}
              onChange={(e) => setGenreInput(e.target.value)}
              placeholder="例如: 诡异废土、科幻末日修真"
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 text-xs"
            />
          </div>

          <div>
            <label htmlFor="brainwave-skeleton" className="block text-[11px] font-medium text-zinc-400 mb-1">迁移的剧情骨架</label>
            <textarea
              id="brainwave-skeleton"
              rows={3}
              value={skeletonInput}
              onChange={(e) => setSkeletonInput(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 text-xs leading-relaxed"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 font-semibold rounded-md text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10 disabled:opacity-50"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>{isGenerating ? 'AI 正在推演融合中...' : '推演全新脑洞'}</span>
          </button>

          {/* 错误紧跟在触发按钮下方：手机端详情面板默认隐藏，放在那里用户看不到 */}
          {errorMsg && (
            <div role="alert" className="p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        <EditorNotice notice={notice} onDismiss={dismissNotice} />

        {/* 创意列表：选中按钮与删除按钮并列，避免按钮嵌套 */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
          {ideas.map((idea) => {
            const isSelected = idea.id === currentIdea?.id;
            return (
              <div
                key={idea.id}
                className={`flex items-stretch transition-colors ${
                  isSelected ? 'bg-amber-500/10 border-l-2 border-amber-500' : 'hover:bg-zinc-800/40'
                }`}
              >
                <button
                  onClick={() => {
                    setSelectedIdeaId(idea.id);
                    if (window.innerWidth < 768) {
                      setMobileTab('detail');
                    }
                  }}
                  className={`flex-1 min-w-0 text-left p-3 text-xs flex flex-col gap-1 ${isSelected ? 'text-amber-300' : 'text-zinc-300'}`}
                >
                  <span className="font-semibold text-zinc-100 truncate">{idea.title}</span>
                  <span className="text-[10px] text-zinc-500">{idea.genre}</span>
                </button>
                <button
                  onClick={() => handleDeleteIdea(idea)}
                  className="px-3 text-zinc-600 hover:text-rose-400 shrink-0"
                  title="删除脑洞"
                  aria-label={`删除脑洞「${idea.title}」`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          {ideas.length === 0 && (
            <p className="p-4 text-center text-[11px] text-zinc-500">还没有脑洞，填写上方题材与骨架后点击「推演全新脑洞」</p>
          )}
        </div>
      </aside>

      {/* 2. 右侧灵感卡片详述 (手机端受 mobileTab 控制，桌面端直接填充) */}
      <main className={`flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-950 ${
        mobileTab === 'detail' ? 'block' : 'hidden md:block'
      }`}>
        {currentIdea ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* 顶栏标题与一键开写：手机端上下排列，按钮整行，避免标题与按钮文字同时折行 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  {currentIdea.genre}
                </span>
                <h2 className="text-xl font-bold text-zinc-100 mt-2">{currentIdea.title}</h2>
                <p className="text-[11px] text-zinc-500 mt-1">创作台的示范初稿与资产映射正在参考这条脑洞</p>
              </div>
              <button
                onClick={() => handleUseIdeaForWriting(currentIdea)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold rounded-lg text-xs shadow-lg shadow-amber-500/15 whitespace-nowrap shrink-0"
              >
                <span>采用此大纲立即仿写</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* 迁移源骨架 */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-1">
              <span className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider">
                继承的故事架构
              </span>
              <p className="text-zinc-300 leading-relaxed">{currentIdea.source_skeleton}</p>
            </div>

            {/* 金手指与代价 */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Sparkles className="w-4 h-4" />
                <span>金手指设定与代价机制 (Core Mechanism)</span>
              </div>
              <p className="text-zinc-200 leading-relaxed font-sans">{currentIdea.golden_finger}</p>
            </div>

            {/* 核心冲突 */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                <Target className="w-4 h-4" />
                <span>核心矛盾与对抗阻碍 (Main Conflict)</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">{currentIdea.main_conflict}</p>
            </div>

            {/* 三幕式节拍 */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-3">
              <h3 className="font-semibold text-zinc-200">三幕式节拍演化</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-amber-400 font-bold block mb-1">【第一幕·起】</span>
                  <p className="text-zinc-400 leading-relaxed text-[11px]">{currentIdea.three_act_beats.act1}</p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-blue-400 font-bold block mb-1">【第二幕·承】</span>
                  <p className="text-zinc-400 leading-relaxed text-[11px]">{currentIdea.three_act_beats.act2}</p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                  <span className="text-[10px] text-purple-400 font-bold block mb-1">【第三幕·转合】</span>
                  <p className="text-zinc-400 leading-relaxed text-[11px]">{currentIdea.three_act_beats.act3}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-zinc-500 text-xs px-4">
            {ideas.length > 0
              ? '尚未选用脑洞：从左侧点选一条，创作台的示范初稿与资产映射就会参考它'
              : '请从左侧选择创意或点击生成全新脑洞'}
          </div>
        )}
      </main>
    </div>
  );
};
