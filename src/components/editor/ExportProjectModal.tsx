import { 
  FileDown, 
  Copy, 
  Check, 
  BookMarked, 
  FileText,
  X
} from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { copyText } from '../../utils/clipboard';
import { chapterTitleOrDefault } from '../../stores/chapterOps';
import React, { useState } from 'react';
import { useNovelStore } from '../../stores/novelStore';
import { bookVolumes } from '../../utils/storyContext';

interface Props {
  onClose: () => void;
}

export const ExportProjectModal: React.FC<Props> = ({ onClose }) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { volumes: allVolumes, activeChapterId, myCharacters, myWorldElements, draftTitle, ideas, selectedIdeaId } = useNovelStore();
  // 只导出当前这本书：项目里可能还有上一本书或演示卷
  const volumes = bookVolumes(allVolumes, activeChapterId);
  const otherVolumeCount = allVolumes.length - volumes.length;
  const [exportFormat, setExportFormat] = useState<'markdown' | 'txt'>('markdown');
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');
  // 下载触发后提示文件名；浏览器不会回报是否保存成功，只能告知去哪里找
  const [downloadedName, setDownloadedName] = useState<string | null>(null);

  const currentIdea = ideas.find(i => i.id === selectedIdeaId);
  const bookTitle = currentIdea?.title || draftTitle.split('：')[0].replace(/[《》]/g, '') || '我的小说作品';

  // 1. 生成纯小说全书合并文本 (.txt)
  const generatePureTxt = () => {
    let text = `《${bookTitle}》\n`;
    if (currentIdea) {
      // source_skeleton 是「借鉴了哪部原作的骨架」的策划笔记，不能当简介写进可投稿的正文
      text += `题材：${currentIdea.genre}\n\n`;
    }
    volumes.forEach(v => {
      text += `\n====================================\n`;
      // 分卷简介多是「采用此大纲」写入的策划大纲（金手指、三幕节拍），不进可投稿的纯正文；Markdown 存档版保留
      text += `${v.title}\n`;
      text += `====================================\n\n`;

      v.chapters.forEach(c => {
        text += `\n${chapterTitleOrDefault(c.title)}\n\n`;
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
        md += `- [${chapterTitleOrDefault(c.title)}](#chapter-${vi}-${ci}) (${c.word_count}字 - ${c.status === 'completed' ? '已定稿' : '草稿'})\n`;
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
        md += `## ${chapterTitleOrDefault(c.title)}\n\n`;
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
    const fileName = `${bookTitle}.${ext}`;
    a.download = fileName;
    a.click();
    // 立即释放会让 Safari / Firefox 的下载失败，稍后再释放
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadedName(fileName);
  };

  // 复制到剪贴板
  const handleCopy = async () => {
    const content = exportFormat === 'txt' ? generatePureTxt() : generateFullMarkdown();
    const ok = await copyText(content);
    setCopyState(ok ? 'done' : 'failed');
    setTimeout(() => setCopyState('idle'), ok ? 2000 : 4000);
  };

  // 统计字数
  const totalWords = volumes.reduce((acc, v) => acc + v.chapters.reduce((sum, c) => sum + c.word_count, 0), 0);
  const totalChapters = volumes.reduce((acc, v) => acc + v.chapters.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        tabIndex={-1}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl max-h-[85dvh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <FileDown className="w-4 h-4" />
            </div>
            <div>
              <h3 id="export-dialog-title" className="text-sm font-bold text-zinc-100">作品全量归档导出</h3>
              <p className="text-[11px] text-zinc-400">将多卷分章小说与设定集一键打包落地</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="关闭导出" className="text-zinc-400 hover:text-zinc-200 p-1"><X className="w-4 h-4" /></button>
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

        {otherVolumeCount > 0 && (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            只导出当前这本书（{volumes.length} 卷）；项目里另有 {otherVolumeCount} 卷属于其他书，切到那本书的章节再导出。
          </p>
        )}

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
        {/* 窄屏放不下时按钮整体换行，按钮文字不折行 */}
        <div className="pt-2 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1.5 whitespace-nowrap"
          >
            {copyState === 'done' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span aria-live="polite" className={copyState === 'failed' ? 'text-rose-300' : undefined}>
              {copyState === 'done' ? '已复制全书' : copyState === 'failed' ? '复制失败，请手动选中复制' : '复制全书文本'}
            </span>
          </button>

          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:bg-zinc-800 whitespace-nowrap"
            >
              取消
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-zinc-950 flex items-center gap-1.5 shadow-md shadow-amber-500/20 whitespace-nowrap"
            >
              <FileDown className="w-4 h-4" />
              <span>下载到本地文件</span>
            </button>
          </div>
        </div>
        {downloadedName && (
          <p role="status" className="text-[11px] text-emerald-400">
            已开始下载《{downloadedName}》，可在浏览器下载列表或「下载」文件夹中找到
          </p>
        )}
      </div>
    </div>
  );
};
