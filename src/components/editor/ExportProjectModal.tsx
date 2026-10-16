import { 
  FileDown, 
  Copy, 
  Check, 
  BookMarked, 
  FileText
} from 'lucide-react';
import React, { useState } from 'react';
import { useNovelStore } from '../../stores/novelStore';

interface Props {
  onClose: () => void;
}

export const ExportProjectModal: React.FC<Props> = ({ onClose }) => {
  const { volumes, myCharacters, myWorldElements, draftTitle, ideas, selectedIdeaId } = useNovelStore();
  const [exportFormat, setExportFormat] = useState<'markdown' | 'txt' | 'dossier'>('markdown');
  const [copied, setCopied] = useState(false);

  const currentIdea = ideas.find(i => i.id === selectedIdeaId);
  const bookTitle = currentIdea?.title || draftTitle.split('：')[0].replace(/[《》]/g, '') || '我的小说作品';

  // 1. 生成纯小说全书合并文本 (.txt)
  const generatePureTxt = () => {
    let text = `《${bookTitle}》\n`;
    if (currentIdea) {
      text += `题材：${currentIdea.genre}\n简介：${currentIdea.source_skeleton}\n\n`;
    }
    volumes.forEach(v => {
      text += `\n====================================\n`;
      text += `${v.title}\n`;
      if (v.description) text += `【本卷简介】：${v.description}\n`;
      text += `====================================\n\n`;

      v.chapters.forEach(c => {
        text += `\n${c.title}\n\n`;
        text += `${c.content || '（暂无正文）'}\n\n`;
      });
    });
    return text;
  };

  // 2. 生成标准 Markdown 电子书 (带目录、设定与分卷)
  const generateFullMarkdown = () => {
    let md = `# 📖 《${bookTitle}》\n\n`;
    if (currentIdea) {
      md += `> **题材风格**：${currentIdea.genre}  \n`;
      md += `> **核心金手指**：${currentIdea.golden_finger}  \n`;
      md += `> **底层主线冲突**：${currentIdea.main_conflict}  \n\n`;
    }

    md += `## 目录 (Table of Contents)\n`;
    volumes.forEach((v, vi) => {
      md += `### ${v.title}\n`;
      v.chapters.forEach((c, ci) => {
        md += `- [${c.title}](#chapter-${vi}-${ci}) (${c.word_count}字 - ${c.status === 'completed' ? '已定稿' : '草稿'})\n`;
      });
    });
    md += `\n---\n\n`;

    // 附录：人设与设定
    if (myCharacters.length > 0 || myWorldElements.length > 0) {
      md += `## 📚 附录：新书设定集\n`;
      if (myCharacters.length > 0) {
        md += `### 👥 核心人物卡\n`;
        myCharacters.forEach(c => {
          md += `- **${c.name}**【${c.role}】：动作【${c.key_action}】，动机欲望【${c.inner_motivation}】\n`;
        });
        md += `\n`;
      }
      if (myWorldElements.length > 0) {
        md += `### 🌐 世界观法则与道具\n`;
        myWorldElements.forEach(w => {
          md += `- **${w.term}** (${w.category})：${w.description}\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    }

    // 正文各卷各章
    volumes.forEach((v, vi) => {
      md += `# ${v.title}\n`;
      if (v.description) md += `*${v.description}*\n\n`;

      v.chapters.forEach((c, ci) => {
        md += `<a id="chapter-${vi}-${ci}"></a>\n\n`;
        md += `## ${c.title}\n\n`;
        md += `${c.content || '*(本章暂无正文)*'}\n\n`;
      });
    });

    return md;
  };

  // 下载文件到本地
  const handleDownload = () => {
    let content = '';
    let ext = 'md';
    let mime = 'text/markdown';

    if (exportFormat === 'txt') {
      content = generatePureTxt();
      ext = 'txt';
      mime = 'text/plain';
    } else {
      content = generateFullMarkdown();
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bookTitle}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 复制到剪贴板
  const handleCopy = () => {
    const content = exportFormat === 'txt' ? generatePureTxt() : generateFullMarkdown();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 统计字数
  const totalWords = volumes.reduce((acc, v) => acc + v.chapters.reduce((sum, c) => sum + c.word_count, 0), 0);
  const totalChapters = volumes.reduce((acc, v) => acc + v.chapters.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <FileDown className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">作品全量归档导出</h3>
              <p className="text-[11px] text-zinc-400">将多卷分章小说与设定集一键打包落地</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 text-xs">✕</button>
        </div>

        {/* 作品统计指标 */}
        <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-around text-center text-xs">
          <div>
            <span className="text-[10px] text-zinc-500 block">作品全名</span>
            <span className="font-semibold text-zinc-200 truncate max-w-[120px] block">{bookTitle}</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div>
            <span className="text-[10px] text-zinc-500 block">分卷/章节</span>
            <span className="font-mono text-amber-400">{volumes.length} 卷 / {totalChapters} 章</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div>
            <span className="text-[10px] text-zinc-500 block">正文总字数</span>
            <span className="font-mono text-emerald-400 font-bold">{totalWords.toLocaleString()} 字</span>
          </div>
        </div>

        {/* 格式选择 */}
        <div className="space-y-2 text-xs">
          <span className="font-medium text-zinc-300 block">选择导出格式：</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setExportFormat('markdown')}
              className={`p-3 rounded-lg border text-left transition-all ${
                exportFormat === 'markdown'
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span>Markdown 电子书 (.md)</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                包含目录锚点链接、全书大纲、附录人物卡与设定集，支持导入 Obsidian。
              </p>
            </button>

            <button
              onClick={() => setExportFormat('txt')}
              className={`p-3 rounded-lg border text-left transition-all ${
                exportFormat === 'txt'
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                <BookMarked className="w-3.5 h-3.5" />
                <span>纯文本小说合集 (.txt)</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                干净纯净的标准正文格式，可直接投稿或上传至各大阅读平台。
              </p>
            </button>
          </div>
        </div>

        {/* 动作按钮 */}
        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制全书' : '复制全书文本'}</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-zinc-950 flex items-center gap-1.5 shadow-md shadow-amber-500/20"
            >
              <FileDown className="w-4 h-4" />
              <span>下载到本地文件</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
