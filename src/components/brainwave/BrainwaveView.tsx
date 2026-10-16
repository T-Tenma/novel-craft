import React, { useState } from 'react';
import { useNovelStore } from '../../stores/novelStore';
import { generateBrainwaveWithLLM } from '../../services/llm';
import { Sparkles, ArrowRight, Wand2, Compass, Target, List, FileText } from 'lucide-react';

export const BrainwaveView: React.FC = () => {
  const { 
    ideas, 
    addIdea, 
    selectedIdeaId, 
    setSelectedIdeaId,
    apiBaseUrl, 
    apiKey, 
    modelName,
    setActiveTab,
    setDraftTitle
  } = useNovelStore();

  const [genreInput, setGenreInput] = useState('赛博朋克 + 东方修真克苏鲁');
  const [skeletonInput, setSkeletonInput] = useState(
    '参考《诡秘之主》第一卷模式：主角死局重生 ➔ 接触禁忌超自然组织 ➔ 获得带有反噬代价的金手指 ➔ 导师献祭与终局高潮'
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 🌟 手机端视图分段切换: 'generator' (创意生成与列表) | 'detail' (灵感卡片详述) 🌟
  const [mobileTab, setMobileTab] = useState<'generator' | 'detail'>('generator');

  const currentIdea = ideas.find(i => i.id === selectedIdeaId) || ideas[0];

  const handleGenerate = async () => {
    if (!apiKey) {
      alert('请先在右上角【模型配置】中配置您的 API Key');
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
      setErrorMsg(err.message || '生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseIdeaForWriting = (idea: typeof currentIdea) => {
    if (!idea) return;
    setDraftTitle(`《${idea.title}》第一章：死局重生`);
    setActiveTab('write');
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-zinc-950 text-zinc-100 pb-14 md:pb-0">
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
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">目标新题材</label>
            <input
              type="text"
              value={genreInput}
              onChange={(e) => setGenreInput(e.target.value)}
              placeholder="例如: 诡异废土、科幻末日修真"
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">迁移的剧情骨架</label>
            <textarea
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
        </div>

        {/* 创意列表 */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
          {ideas.map((idea) => {
            const isSelected = idea.id === currentIdea?.id;
            return (
              <button
                key={idea.id}
                onClick={() => {
                  setSelectedIdeaId(idea.id);
                  if (window.innerWidth < 768) {
                    setMobileTab('detail');
                  }
                }}
                className={`w-full text-left p-3 text-xs transition-colors flex flex-col gap-1 ${
                  isSelected ? 'bg-amber-500/10 text-amber-300 border-l-2 border-amber-500' : 'hover:bg-zinc-800/40 text-zinc-300'
                }`}
              >
                <span className="font-semibold text-zinc-100 truncate">{idea.title}</span>
                <span className="text-[10px] text-zinc-500">{idea.genre}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 2. 右侧灵感卡片详述 (手机端受 mobileTab 控制，桌面端直接填充) */}
      <main className={`flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-950 ${
        mobileTab === 'detail' ? 'block' : 'hidden md:block'
      }`}>
        {errorMsg && (
          <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {currentIdea ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* 顶栏标题与一键开写 */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  {currentIdea.genre}
                </span>
                <h2 className="text-xl font-bold text-zinc-100 mt-2">{currentIdea.title}</h2>
              </div>
              <button
                onClick={() => handleUseIdeaForWriting(currentIdea)}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold rounded-lg text-xs shadow-lg shadow-amber-500/15"
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
          <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
            请从左侧选择创意或点击生成全新脑洞
          </div>
        )}
      </main>
    </div>
  );
};
