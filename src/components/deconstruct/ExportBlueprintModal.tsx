import React, { useState } from 'react';
import { NovelMetadata, ChapterAnalysis, CharacterItem, WorldElement } from '../../types';
import { useNovelStore } from '../../stores/novelStore';
import { 
  Sparkles, 
  ArrowRight, 
  Copy, 
  Check, 
  BookMarked, 
  Feather
} from 'lucide-react';

interface Props {
  novel: NovelMetadata;
  analyses: Record<number, ChapterAnalysis>;
  characters: CharacterItem[];
  worldElements: WorldElement[];
  onClose: () => void;
}

export const ExportBlueprintModal: React.FC<Props> = ({
  novel,
  analyses,
  characters,
  worldElements,
  onClose,
}) => {
  const { setActiveTab, setDraftTitle, setDraftContent, addIdea, setSelectedIdeaId } = useNovelStore();
  const [copied, setCopied] = useState(false);

  const analyzedList = Object.values(analyses).sort((a, b) => a.chapter_id - b.chapter_id);

  // 1. 自动提炼的故事骨架公式
  const firstHook = analyzedList[0]?.narrative_hook || '开篇强悬念介入，制造致命危机与身份倒错';
  const averageTension =
    analyzedList.length > 0
      ? (analyzedList.reduce((acc, a) => acc + a.tension_score, 0) / analyzedList.length).toFixed(1)
      : '7.5';

  const skeletonSummary = `参考《${novel.file_name.replace(/\.[^/.]+$/, '')}》结构模型：
1. 开篇钩子：${firstHook}
2. 推进节奏：平均张力 ${averageTension} 分，采用'事件倒逼行动 ➔ 危机逐步升级 ➔ 触碰世界暗线'递进模式。
3. 核心机制：角色处于严重信息不对称的被动处境，通过细微线索破局，同时承受设定的负面代价约束。`;

  // 2. 生成完整的 Markdown 学习与拆解报告 (可供 Obsidian 导入)
  const generateMarkdown = () => {
    let md = `# 📖 《${novel.file_name}》深度逆向解构与创作学习蓝图\n\n`;
    md += `> 统计：总计 ${novel.total_chapters} 章，已深度拆解 ${analyzedList.length} 个节拍点，全书平均情绪张力：${averageTension} / 10\n\n`;

    md += `## 🎯 提炼出的通用故事创作公式 (Story Formula)\n`;
    md += `- **开篇吸睛法**：${firstHook}\n`;
    md += `- **节奏模型**：多线交织，每 2-3 章抛出一次次级反转，严控读者翻页悬念。\n\n`;

    md += `## 📊 分章节拆解与学习对照表\n`;
    analyzedList.forEach((a) => {
      md += `### 第 ${a.chapter_id} 章：${a.chapter_title} (张力: ★${a.tension_score})\n`;
      md += `- **事件概括**：${a.summary}\n`;
      md += `- **留存钩子**：${a.narrative_hook}\n`;
      md += `- **名家技法**：${a.technique_notes}\n\n`;
    });

    if (characters.length > 0) {
      md += `## 👥 角色人物志矩阵\n`;
      characters.forEach((c) => {
        md += `- **[[${c.name}]]**（${c.role}）：关键行动【${c.key_action}】，核心欲望动机【${c.inner_motivation}】\n`;
      });
      md += `\n`;
    }

    if (worldElements.length > 0) {
      md += `## 🌐 世界观与法则设定集\n`;
      worldElements.forEach((w) => {
        md += `- **【${w.term}】** (${w.category})：${w.description}\n`;
      });
      md += `\n`;
    }

    md += `\n---\n*由 NovelCraft 小说工坊逆向拆解生成*`;
    return md;
  };

  // 动作 1：一键迁移骨架到【脑洞生成库】
  const handleMigrateToBrainwave = () => {
    const newIdea = {
      id: `idea-migrated-${Date.now()}`,
      title: `基于《${novel.file_name.replace(/\.[^/.]+$/, '')}》结构的新书构想`,
      genre: '可自定义：例如科幻修仙 / 诡异都市 / 末日法则',
      source_skeleton: skeletonSummary,
      golden_finger: '参考原著逻辑：必须具有极强破局能力，但使用时伴随不可逆的规则代价',
      main_conflict: '主角在绝境中求生，对抗庞大而不可直视的既得利益/超自然集团',
      three_act_beats: {
        act1: `第一幕：${firstHook}，并在第3章前完成初始金手指觉醒。`,
        act2: `第二幕：遭遇危机连环升级，假意屈从或加入中立组织，寻找反击缝隙。`,
        act3: `第三幕：迎来第一卷终局危机，以惨烈代价破茧成蝶。`,
      },
    };
    addIdea(newIdea);
    setSelectedIdeaId(newIdea.id);
    setActiveTab('brainwave');
    onClose();
  };

  // 动作 2：一键载入【仿写创作台】
  const handleLoadIntoEditor = () => {
    setDraftTitle(`《仿${novel.file_name.replace(/\.[^/.]+$/, '')}节奏》第一章：`);
    let promptGuide = `【本章仿写指引（参考原著黄金开篇）】\n`;
    promptGuide += `1. 核心目标：前 300 字抛出核心危机，模仿原著开局的悬念手法：“${firstHook}”。\n`;
    promptGuide += `2. 节奏张力指标：本章目标张力 ≥ ${analyzedList[0]?.tension_score || 8} 分。\n`;
    promptGuide += `3. 避免陈词滥调的世界观交代，把主角直接推进第一现场。\n\n`;
    promptGuide += `------------------------------------\n正文从这里开始写：\n\n`;

    setDraftContent(promptGuide);
    setActiveTab('write');
    onClose();
  };

  // 复制 Markdown
  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(generateMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                提炼创作蓝图与快速学习复用
              </h3>
              <p className="text-[11px] text-zinc-400">将拆解成果一键转化为你的写作武器库</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 text-xs">✕</button>
        </div>

        {/* 提炼出的公式卡 */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <BookMarked className="w-4 h-4" />
              抽象出的通用故事骨架 (Abstract Formula)
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
              可跨题材复用
            </span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
            {skeletonSummary}
          </p>
        </div>

        {/* 三个极速复用动作 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 动作 1 */}
          <button
            onClick={handleMigrateToBrainwave}
            className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 hover:border-amber-400 text-left transition-all group flex flex-col justify-between"
          >
            <div>
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                <Sparkles className="w-4 h-4" />
                1. 套用此骨架推演新脑洞
              </span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                把这本小说的节奏结构直接套进新题材（如赛博、末日），生成专属新书案。
              </p>
            </div>
            <div className="pt-3 flex items-center gap-1 text-[11px] font-semibold text-amber-400 group-hover:translate-x-1 transition-transform">
              <span>立即去立项</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>

          {/* 动作 2 */}
          <button
            onClick={handleLoadIntoEditor}
            className="p-3.5 rounded-xl bg-gradient-to-br from-purple-500/15 via-purple-500/5 to-transparent border border-purple-500/30 hover:border-purple-400 text-left transition-all group flex flex-col justify-between"
          >
            <div>
              <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5 mb-1">
                <Feather className="w-4 h-4" />
                2. 作为对照大纲直接仿写
              </span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                将拆解出的黄金开局要领注入仿写台，右侧直接对照原著节拍分章动笔。
              </p>
            </div>
            <div className="pt-3 flex items-center gap-1 text-[11px] font-semibold text-purple-400 group-hover:translate-x-1 transition-transform">
              <span>进入创作台开写</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>

        {/* 导出 Markdown 笔记 */}
        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            支持完整导出为 Obsidian / 写作软件双链笔记结构
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制全套 Markdown' : '复制拆解研习笔记'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
