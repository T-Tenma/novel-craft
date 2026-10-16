import React, { useState, useRef, useEffect } from 'react';
import { useNovelStore } from '../../stores/novelStore';
import { NovelMetadata, Chapter } from '../../types';
import { analyzeChapterWithLLM, analyzeSelectedParagraph } from '../../services/llm';
import { 
  persistNovel, 
  persistChapterAnalysis, 
  loadCachedAnalyses,
  listStoredNovels,
  loadNovelFromStorage,
  deleteStoredNovel,
  NovelSummary
} from '../../services/db';
import { batchPipeline } from '../../services/batchPipeline';
import { TensionChart } from './TensionChart';
import { ExportBlueprintModal } from './ExportBlueprintModal';
import { invoke } from '@tauri-apps/api/core';
import { 
  Upload, 
  Users, 
  Globe, 
  Activity, 
  Zap, 
  Sparkles, 
  BookOpen, 
  Loader2, 
  FileText,
  Play,
  Pause,
  Square,
  TrendingUp,
  BookmarkCheck,
  Microscope,
  Eye,
  Crosshair,
  Target,
  Library,
  Trash2,
  ChevronRight,
  Clock,
  List
} from 'lucide-react';

// 文本解码辅助函数
async function readFileAsTextSmart(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(buffer);
  } catch {
    try {
      const gbkDecoder = new TextDecoder('gb18030');
      return gbkDecoder.decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

// 纯前端强鲁棒性切章函数
function splitNovelChaptersInBrowser(fileName: string, text: string): NovelMetadata {
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const chapterRegex = /^[ \t]*(第[0-9一二三四五六七八九十百千万]+[章卷回节篇部][^\n\r]{0,40}|Chapter\s+[0-9]+[^\n\r]{0,40}|[0-9]{1,4}[\.、\s][^\n\r]{1,30}|序[章言][^\n\r]{0,20}|尾声[^\n\r]{0,20}|番外[^\n\r]{0,20})/gm;

  const matches: { index: number; title: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = chapterRegex.exec(cleanText)) !== null) {
    matches.push({
      index: m.index,
      title: m[1].trim(),
    });
  }

  const chapters: Chapter[] = [];

  if (matches.length === 0) {
    const chunkSize = 3500;
    const totalLen = cleanText.length;
    let chId = 1;
    for (let i = 0; i < totalLen; i += chunkSize) {
      const chunk = cleanText.slice(i, i + chunkSize);
      chapters.push({
        id: chId,
        title: `第 ${chId} 节 (自动分段)`,
        word_count: chunk.replace(/\s+/g, '').length,
        preview: chunk.slice(0, 150),
        content: chunk,
      });
      chId++;
    }
  } else {
    if (matches[0].index > 50) {
      const intro = cleanText.slice(0, matches[0].index).trim();
      if (intro.length > 20) {
        chapters.push({
          id: 0,
          title: '引言 / 序幕',
          word_count: intro.replace(/\s+/g, '').length,
          preview: intro.slice(0, 150),
          content: intro,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : cleanText.length;
      const full = cleanText.slice(start, end).trim();
      const title = matches[i].title;

      chapters.push({
        id: i + 1,
        title,
        word_count: full.replace(/\s+/g, '').length,
        preview: full.slice(0, 150),
        content: full,
      });
    }
  }

  return {
    file_name: fileName,
    total_words: chapters.reduce((acc, c) => acc + c.word_count, 0),
    total_chapters: chapters.length,
    chapters,
  };
}

export const DeconstructView: React.FC = () => {
  const { 
    novel, 
    setNovel, 
    selectedChapterId, 
    setSelectedChapterId,
    analyses,
    setChapterAnalysis,
    setAllAnalyses,
    isAnalyzing,
    setIsAnalyzing,
    apiBaseUrl,
    apiKey,
    modelName,
    batchProgress,
    batchConcurrency,
    globalCharacters,
    globalWorldElements,
    updateGlobalAggregations
  } = useNovelStore();

  const [parsing, setParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showBlueprintModal, setShowBlueprintModal] = useState(false);
  
  // 右侧看板 Tab：'single' (章节概况) | 'micro' (段落显微镜) | 'panorama' (全书图谱)
  const [rightPanelTab, setRightPanelTab] = useState<'single' | 'micro' | 'panorama'>('micro');
  
  // 🌟 核心新功能：手机端单屏视图切换 ('reader' | 'chapters' | 'analysis') 🌟
  const [mobileView, setMobileView] = useState<'reader' | 'chapters' | 'analysis'>('reader');

  // 当前聚焦选中的自然段索引
  const [selectedParaIdx, setSelectedParaIdx] = useState<number | null>(0);
  const [isAnalyzingSinglePara, setIsAnalyzingSinglePara] = useState(false);

  // 已导入历史小说书架列表
  const [showBookshelfModal, setShowBookshelfModal] = useState(false);
  const [storedNovels, setStoredNovels] = useState<NovelSummary[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentChapter = novel?.chapters.find(c => c.id === selectedChapterId) || novel?.chapters[0];
  const currentAnalysis = currentChapter ? analyses[currentChapter.id] : null;

  // 将正文拆为非空自然段列表
  const paragraphs = currentChapter ? currentChapter.content.split(/\n+/).map(p => p.trim()).filter(Boolean) : [];

  // 获取当前聚焦段落的深度分析
  const activeParagraphAnalysis = currentAnalysis?.paragraph_analyses?.find(
    pa => pa.index === (selectedParaIdx !== null ? selectedParaIdx + 1 : 1) ||
          (selectedParaIdx !== null && paragraphs[selectedParaIdx]?.includes(pa.paragraph_excerpt.slice(0, 15)))
  ) || currentAnalysis?.paragraph_analyses?.[0];

  const refreshBookshelf = async () => {
    const list = await listStoredNovels();
    setStoredNovels(list);
  };

  useEffect(() => {
    refreshBookshelf();
  }, [novel?.file_name]);

  useEffect(() => {
    if (novel) {
      loadCachedAnalyses(novel.file_name, novel.chapters.map(c => c.id)).then(cached => {
        if (Object.keys(cached).length > 0) {
          setAllAnalyses(cached);
          Object.values(cached).forEach(a => updateGlobalAggregations(a));
        }
      });
    }
  }, [novel?.file_name]);

  const handleSelectStoredNovel = async (fileName: string) => {
    setParsing(true);
    setErrorMsg('');
    try {
      const data = await loadNovelFromStorage(fileName);
      if (data) {
        setNovel(data);
        setShowBookshelfModal(false);
        setMobileView('reader');
      } else {
        setErrorMsg('无法读取该小说的正文缓存');
      }
    } catch (err: any) {
      setErrorMsg('切换小说失败: ' + err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleDeleteStoredNovel = async (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`确定要从本地历史书库中移除《${fileName}》吗？`)) {
      await deleteStoredNovel(fileName);
      await refreshBookshelf();
      if (novel?.file_name === fileName) {
        setNovel(null);
      }
    }
  };

  const handleLoadSample = async () => {
    setParsing(true);
    setErrorMsg('');
    const sampleText = `第一章 绯红

痛！好痛！
头部像是被一柄锈蚀的钝刀狠狠搅碎，伴随着剧烈嗡鸣与刺痛，周明瑞猛然从浑噩中睁开双眼。

身下是维多利亚时代的破旧书桌，桌上放着一本笔记本、煤油灯，以及一把左轮手枪！
枪口残留着一缕若有若无的硝烟味，旁边还散落着几枚铜黄色的子弹。

周明瑞下意识地摸向自己的太阳穴——指尖触碰到的，是一个带着温热黏稠血液的创口，那是子弹贯穿留下的致命痕迹！

“我……死了？那我又是谁？”
无数混乱而狂暴的记忆碎片如同决堤的洪水般强行冲入脑海：
克莱恩·莫雷蒂，鲁恩王国阿霍瓦郡廷根市常思大学历史系毕业生……原主似乎死于一场诡异的自杀仪式？

周明瑞颤抖着站起身，窗外高悬着一轮巨大而妖异的绯红色满月，正静静俯瞰着整座工业迷雾笼罩下的古老城市。

第二章 调查

清晨的薄雾还没散尽，楼下传来沉重的皮靴声。
两名黑风衣男子敲门，自称阿霍瓦郡特殊行动小队。
关于昨夜水街的失踪案，他们对克莱恩展开生死盘问。

第三章 倾听

克莱恩在盘问中展现了出色的历史系素养，勉强洗脱直接嫌疑。
然而深夜里，耳畔却不断响起未知邪神不可名状的重叠呓语。

第四章 仪式

为了自救，克莱恩翻找出原主的神秘学古籍，开始尝试四角转运仪式。
灰雾在眼前升腾，古老宏伟的巨人宫殿从虚空中拔地而起！`;

    try {
      let data = splitNovelChaptersInBrowser('诡秘之主（测试样本）.txt', sampleText);
      await persistNovel(data);
      setNovel(data);
      setMobileView('reader');
    } catch (err: any) {
      setErrorMsg(err.message || '加载样本失败');
    } finally {
      setParsing(false);
    }
  };

  const processFile = async (file: File) => {
    setParsing(true);
    setErrorMsg('');
    try {
      const text = await readFileAsTextSmart(file);
      if (!text || text.trim().length === 0) {
        throw new Error('文件内容为空');
      }

      let data: NovelMetadata;
      try {
        data = await invoke<NovelMetadata>('parse_novel_text', {
          fileName: file.name,
          content: text,
        });
      } catch {
        data = splitNovelChaptersInBrowser(file.name, text);
      }

      await persistNovel(data);
      setNovel(data);
      setMobileView('reader');
    } catch (err: any) {
      setErrorMsg('解析失败: ' + err.message);
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyzeCurrentChapter = async () => {
    if (!currentChapter) return;
    if (!apiKey) {
      alert('请先点击右上角【配置模型 API】配置密钥');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const result = await analyzeChapterWithLLM(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        String(currentChapter.title),
        currentChapter.content
      );
      result.chapter_id = currentChapter.id;
      await persistChapterAnalysis(novel!.file_name, currentChapter.id, result);
      setChapterAnalysis(currentChapter.id, result);
      updateGlobalAggregations(result);
      setRightPanelTab('micro');
      // 手机端自动切到分析面板展示结果
      if (window.innerWidth < 768) {
        setMobileView('analysis');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '拆解失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeCurrentParagraph = async (paraIdx: number) => {
    if (!currentChapter || !apiKey) return;
    const targetPara = paragraphs[paraIdx];
    if (!targetPara) return;

    setIsAnalyzingSinglePara(true);
    try {
      const singleAnalysis = await analyzeSelectedParagraph(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        targetPara,
        currentChapter.content
      );
      singleAnalysis.index = paraIdx + 1;

      const updatedParaList = [...(currentAnalysis?.paragraph_analyses || [])];
      const existingIdx = updatedParaList.findIndex(p => p.index === paraIdx + 1);
      if (existingIdx >= 0) {
        updatedParaList[existingIdx] = singleAnalysis;
      } else {
        updatedParaList.push(singleAnalysis);
      }

      const updatedChapterAnalysis = {
        ...(currentAnalysis || {
          chapter_id: currentChapter.id,
          chapter_title: currentChapter.title,
          summary: '局部拆解章节',
          tension_score: 7,
          narrative_hook: '段落分析',
          characters: [],
          world_elements: [],
          technique_notes: ''
        }),
        paragraph_analyses: updatedParaList
      };

      setChapterAnalysis(currentChapter.id, updatedChapterAnalysis);
      setRightPanelTab('micro');
      if (window.innerWidth < 768) {
        setMobileView('analysis');
      }
    } catch (err: any) {
      alert('单段剖析失败: ' + err.message);
    } finally {
      setIsAnalyzingSinglePara(false);
    }
  };

  const handleStartBatch = (mode: 'all' | 'first10' | 'remaining') => {
    if (!novel) return;
    if (!apiKey) {
      alert('请先在右上角配置并验证模型 API');
      return;
    }

    let targets = [...novel.chapters];
    if (mode === 'first10') {
      targets = targets.slice(0, 10);
    } else if (mode === 'remaining') {
      targets = targets.filter(c => !analyses[c.id]);
    }

    if (targets.length === 0) {
      alert('所选范围内没有需要拆解的章节！');
      return;
    }

    setRightPanelTab('panorama');
    if (window.innerWidth < 768) {
      setMobileView('analysis');
    }

    batchPipeline.startBatch(
      novel.file_name,
      targets,
      { baseUrl: apiBaseUrl, apiKey, model: modelName },
      batchConcurrency
    );
  };

  const totalChs = novel?.chapters.length || 0;
  const analyzedChs = Object.keys(analyses).length;
  const progressPercent = totalChs > 0 ? Math.round((analyzedChs / totalChs) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-zinc-950 text-zinc-100 pb-14 md:pb-0">
      {/* 🌟 手机端顶部视图分段控制器 (Segmented Switcher) 🌟 */}
      {novel && (
        <div className="md:hidden flex items-center justify-around bg-zinc-900 border-b border-zinc-800 p-1.5 shrink-0 z-20">
          <button
            onClick={() => setMobileView('chapters')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mobileView === 'chapters' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>目录 ({novel.total_chapters})</span>
          </button>

          <button
            onClick={() => setMobileView('reader')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mobileView === 'reader' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>正文阅读</span>
          </button>

          <button
            onClick={() => setMobileView('analysis')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              mobileView === 'analysis' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400'
            }`}
          >
            <Microscope className="w-3.5 h-3.5" />
            <span>显微镜/解构</span>
          </button>
        </div>
      )}

      {/* 1. 左侧章节列表与批量控制 (手机端按 Tab 显示/隐藏) */}
      <aside className={`w-full md:w-72 border-r border-zinc-800/80 bg-zinc-900/50 flex flex-col shrink-0 ${
        mobileView === 'chapters' || !novel ? 'flex' : 'hidden md:flex'
      }`}>
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-200 truncate">
              {novel ? novel.file_name : '未导入小说'}
            </span>
          </div>
          
          <button
            onClick={() => {
              refreshBookshelf();
              setShowBookshelfModal(true);
            }}
            className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded shrink-0 transition-colors"
            title="查看已导入的历史小说书架"
          >
            <Library className="w-3 h-3" />
            <span>书库 ({storedNovels.length})</span>
          </button>
        </div>

        {/* 批量整书拆解控制面板 */}
        {novel && (
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-medium">拆解完成率</span>
              <span className="font-mono text-amber-400 font-semibold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {batchProgress.isRunning ? (
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] text-amber-300 truncate font-mono">
                  ⚡ {batchProgress.currentTitle}
                </div>
                <div className="flex gap-2">
                  {batchProgress.isPaused ? (
                    <button
                      onClick={() => batchPipeline.resume()}
                      className="flex-1 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-zinc-100 text-[11px] flex items-center justify-center gap-1"
                    >
                      <Play className="w-3 h-3" /> 继续
                    </button>
                  ) : (
                    <button
                      onClick={() => batchPipeline.pause()}
                      className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] flex items-center justify-center gap-1"
                    >
                      <Pause className="w-3 h-3" /> 暂停
                    </button>
                  )}
                  <button
                    onClick={() => batchPipeline.stop()}
                    className="px-3 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-zinc-100 text-[11px] flex items-center justify-center gap-1"
                  >
                    <Square className="w-3 h-3" /> 停止
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-1 flex flex-col gap-1.5">
                <button
                  onClick={() => handleStartBatch('first10')}
                  className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>极速拆解前 10 章 (黄金开局)</span>
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleStartBatch('remaining')}
                    className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px]"
                  >
                    断点续拆剩余
                  </button>
                  <button
                    onClick={() => handleStartBatch('all')}
                    className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px]"
                  >
                    全书完整拆解
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 章节列表 */}
        {!novel ? (
          <div className="p-4 flex-1 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
              {parsing ? <Loader2 className="w-6 h-6 animate-spin text-amber-400" /> : <Upload className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-300">
                {parsing ? '正在极速切分章节中...' : '选择小说文本'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">UTF-8 / GBK 智能探测与切章</p>
            </div>
            <label className="cursor-pointer px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors">
              选择本地小说 (.txt)
              <input ref={fileInputRef} type="file" accept=".txt" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} className="hidden" />
            </label>
            <button onClick={handleLoadSample} disabled={parsing} className="text-xs text-zinc-400 hover:text-amber-400 underline underline-offset-4 pt-1">
              载入内置演示样本
            </button>

            {storedNovels.length > 0 && (
              <div className="w-full pt-3 border-t border-zinc-800/80 text-left">
                <span className="text-[10px] text-zinc-400 block mb-1.5 font-medium">最近导入的小说：</span>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {storedNovels.slice(0, 3).map(sn => (
                    <button
                      key={sn.file_name}
                      onClick={() => handleSelectStoredNovel(sn.file_name)}
                      className="w-full text-left p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between"
                    >
                      <span className="truncate">{sn.title}</span>
                      <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
            {novel.chapters.map((ch) => {
              const isSelected = ch.id === currentChapter?.id;
              const analysis = analyses[ch.id];
              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    setSelectedChapterId(ch.id);
                    setSelectedParaIdx(0);
                    // 手机端选好章节后自动跳转到正文阅读
                    if (window.innerWidth < 768) {
                      setMobileView('reader');
                    }
                  }}
                  className={`w-full text-left p-3 text-xs transition-colors flex items-start justify-between gap-2 ${
                    isSelected ? 'bg-amber-500/10 text-amber-300 border-l-2 border-amber-500' : 'hover:bg-zinc-800/40 text-zinc-300'
                  }`}
                >
                  <div className="truncate">
                    <p className="font-medium truncate">{String(ch.title)}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{ch.word_count.toLocaleString()} 字</p>
                  </div>
                  {analysis && (
                    <span className="shrink-0 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded font-mono">
                      ★ {analysis.tension_score}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* 2. 中间主工作区：顶部情绪曲线 + 交互式段落流正文 */}
      <main className={`flex-1 flex-col border-r border-zinc-800/80 overflow-hidden bg-zinc-950 ${
        mobileView === 'reader' && novel ? 'flex' : 'hidden md:flex'
      }`}>
        {/* 顶部常驻：情节情绪张力曲线图 */}
        {novel && (
          <div className="p-2 md:p-3 border-b border-zinc-800/80 bg-zinc-900/40 shrink-0">
            <TensionChart
              chapters={novel.chapters}
              analyses={analyses}
              selectedChapterId={selectedChapterId}
              onSelectChapter={(id) => {
                setSelectedChapterId(id);
                setSelectedParaIdx(0);
              }}
            />
          </div>
        )}

        {currentChapter ? (
          <>
            <div className="h-12 border-b border-zinc-800 px-3 md:px-4 flex items-center justify-between bg-zinc-900/30 shrink-0">
              <div className="truncate pr-2">
                <h2 className="text-xs font-semibold text-zinc-200 truncate">{String(currentChapter.title)}</h2>
                <span className="text-[10px] text-zinc-500 font-mono">({currentChapter.word_count.toLocaleString()} 字 · 共 {paragraphs.length} 段)</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleAnalyzeCurrentChapter}
                  disabled={isAnalyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 shadow-md shadow-amber-500/10 disabled:opacity-50"
                  title="全章深度逆向解构"
                >
                  {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isAnalyzing ? '分析中...' : '逆向拆解'}</span>
                </button>
              </div>
            </div>

            {/* 可交互段落流 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 max-w-3xl mx-auto w-full select-text">
              <div className="text-[11px] text-zinc-500 font-sans pb-2 border-b border-zinc-900 flex items-center justify-between">
                <span>💡 点击任意段落查看【作用、手法与总编点评】</span>
                <span className="text-amber-400/80 font-mono text-[10px]">触控交互已就绪</span>
              </div>

              {paragraphs.map((p, idx) => {
                const isFocused = selectedParaIdx === idx;
                const pAnalysis = currentAnalysis?.paragraph_analyses?.find(
                  pa => pa.index === idx + 1 || p.includes(pa.paragraph_excerpt.slice(0, 15))
                );

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedParaIdx(idx);
                      setRightPanelTab('micro');
                      if (window.innerWidth < 768) {
                        setMobileView('analysis');
                      }
                    }}
                    className={`p-3 md:p-3.5 rounded-xl transition-all duration-200 cursor-pointer border relative group ${
                      isFocused
                        ? 'bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/5'
                        : pAnalysis
                        ? 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
                        : 'bg-transparent border-transparent hover:bg-zinc-900/30 hover:border-zinc-800/40'
                    }`}
                  >
                    {/* 段落顶栏标签条 */}
                    {pAnalysis && (
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Microscope className="w-2.5 h-2.5" />
                          第 {idx + 1} 段 · 【{pAnalysis.role_type}】
                        </span>
                        <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded font-sans">
                          手法: {pAnalysis.technique}
                        </span>
                      </div>
                    )}

                    {/* 正文段落文本 */}
                    <p className={`font-serif leading-loose text-sm ${isFocused ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
                      {p}
                    </p>

                    {/* 未分析时悬停提示 */}
                    {!pAnalysis && isFocused && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">该段尚未单独提取微观批注</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnalyzeCurrentParagraph(idx);
                          }}
                          disabled={isAnalyzingSinglePara}
                          className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
                        >
                          {isAnalyzingSinglePara ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                          <span>单独解剖此段</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs space-y-2 p-6 text-center">
            <FileText className="w-8 h-8 opacity-30 text-amber-400" />
            <p>请选择章节或从书库导入小说</p>
          </div>
        )}
      </main>

      {/* 3. 右侧看板：支持【段落显微镜】/【全章解构】/【全书资产】 (手机端按 Tab 显示) */}
      <aside className={`w-full md:w-[420px] bg-zinc-900/40 flex-col overflow-hidden shrink-0 ${
        mobileView === 'analysis' && novel ? 'flex' : 'hidden md:flex'
      }`}>
        {/* 看板顶栏 */}
        <div className="h-12 border-b border-zinc-800 px-3 flex items-center justify-between bg-zinc-950/40 shrink-0">
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-md border border-zinc-800 text-xs">
            <button
              onClick={() => setRightPanelTab('micro')}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                rightPanelTab === 'micro' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Microscope className="w-3 h-3" />
              <span>段落显微镜</span>
            </button>
            <button
              onClick={() => setRightPanelTab('single')}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                rightPanelTab === 'single' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>本章总览</span>
            </button>
            <button
              onClick={() => setRightPanelTab('panorama')}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                rightPanelTab === 'panorama' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>全书资产</span>
            </button>
          </div>

          {novel && (
            <button
              onClick={() => setShowBlueprintModal(true)}
              className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[11px] font-semibold"
              title="提炼整套创作模版"
            >
              <BookmarkCheck className="w-3 h-3" />
              <span>提炼模版</span>
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="m-3 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* 段落显微镜解构视图 */}
          {rightPanelTab === 'micro' && (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-950 rounded-xl border border-amber-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-500 font-mono block">当前透视段落</span>
                  <span className="font-semibold text-zinc-200">
                    第 {selectedParaIdx !== null ? selectedParaIdx + 1 : 1} 段 / 共 {paragraphs.length} 段
                  </span>
                </div>
                {activeParagraphAnalysis && (
                  <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                    【{activeParagraphAnalysis.role_type}】
                  </span>
                )}
              </div>

              {activeParagraphAnalysis ? (
                <div className="space-y-3.5">
                  {/* 1. 这段的作用与叙事目的 (Purpose) */}
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <Target className="w-3.5 h-3.5" />
                      1. 本段核心作用与叙事目的
                    </span>
                    <p className="text-zinc-200 leading-relaxed text-xs font-sans">
                      {activeParagraphAnalysis.purpose}
                    </p>
                  </div>

                  {/* 2. 用了什么文学手法与技法 (Technique) */}
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-purple-500/30 space-y-1.5">
                    <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5 uppercase tracking-wide">
                      <Zap className="w-3.5 h-3.5 text-purple-400" />
                      2. 名家具体使用技法
                    </span>
                    <p className="text-zinc-200 leading-relaxed text-xs">
                      {activeParagraphAnalysis.technique}
                    </p>
                  </div>

                  {/* 3. 对读者心理预期的调动效果 (Psychological Effect) */}
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-emerald-500/30 space-y-1.5">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <Eye className="w-3.5 h-3.5" />
                      3. 读者心理预期与翻页情绪调动
                    </span>
                    <p className="text-zinc-300 leading-relaxed text-xs">
                      {activeParagraphAnalysis.psychological_effect}
                    </p>
                  </div>

                  {/* 4. 专业总编深度毒辣点评 */}
                  <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/15 via-amber-950/20 to-zinc-900 border border-amber-500/40 space-y-1.5 shadow-md">
                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      4. 金牌总编深度技法点评
                    </span>
                    <p className="text-zinc-100 leading-relaxed text-xs font-sans">
                      {activeParagraphAnalysis.editor_comment || '行文极其老辣，动词前置而情绪后发，牢牢卡准了读者的情绪期待点。'}
                    </p>
                  </div>

                  {/* 原文微句对照 */}
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-500 font-serif leading-relaxed">
                    <span className="text-[10px] text-zinc-400 block mb-1 font-mono">段落原文摘录：</span>
                    “{paragraphs[selectedParaIdx || 0] || activeParagraphAnalysis.paragraph_excerpt}”
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-zinc-500 space-y-3">
                  <Microscope className="w-8 h-8 opacity-30 text-amber-400 mx-auto" />
                  <p>当前选中的第 {selectedParaIdx !== null ? selectedParaIdx + 1 : 1} 段暂无深度批注数据</p>
                  <button
                    onClick={() => handleAnalyzeCurrentParagraph(selectedParaIdx || 0)}
                    disabled={isAnalyzingSinglePara}
                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-semibold"
                  >
                    {isAnalyzingSinglePara ? 'AI 正在深度解剖本段...' : '立即单段深度剖析'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 章节宏观总览 */}
          {rightPanelTab === 'single' && (
            currentAnalysis ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <h3 className="font-semibold text-zinc-200 truncate">{currentAnalysis.chapter_title}</h3>
                  <span className="font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                    张力打分: {currentAnalysis.tension_score}/10
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <h4 className="text-[11px] font-semibold text-amber-400 mb-1">事件摘要</h4>
                  <p className="text-zinc-300 leading-relaxed">{currentAnalysis.summary}</p>
                </div>

                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <h4 className="text-[11px] font-semibold text-amber-300 mb-1 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> 留存钩子 (Hook)
                  </h4>
                  <p className="text-zinc-200 leading-relaxed">{currentAnalysis.narrative_hook}</p>
                </div>

                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <h4 className="text-[11px] font-semibold text-purple-400 mb-1">名家技法笔记</h4>
                  <p className="text-zinc-300 leading-relaxed">{currentAnalysis.technique_notes}</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                <Sparkles className="w-8 h-8 opacity-30 text-amber-400" />
                <p>点击「逆向拆解当前章」提取本章结构</p>
              </div>
            )
          )}

          {/* 全书图谱与资产 */}
          {rightPanelTab === 'panorama' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  全书角色档案汇编 ({globalCharacters.length} 位)
                </span>
                <div className="space-y-1.5 max-h-64 overflow-y-auto divide-y divide-zinc-800/40">
                  {globalCharacters.map((c, i) => (
                    <div key={i} className="pt-2 first:pt-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-200">{c.name}</span>
                        <span className="text-[10px] text-zinc-500">{c.role}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">主驱动力: {c.inner_motivation}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  世界观与力量法则词条 ({globalWorldElements.length} 项)
                </span>
                <div className="space-y-1.5 max-h-64 overflow-y-auto divide-y divide-zinc-800/40">
                  {globalWorldElements.map((w, i) => (
                    <div key={i} className="pt-2 first:pt-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-400">{w.term}</span>
                        <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1 rounded">{w.category}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{w.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 已导入历史小说书架列表抽屉 */}
      {showBookshelfModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-5 md:p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Library className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">已导入小说书库</h3>
                  <p className="text-[11px] text-zinc-400">历史导入的所有小说已保存在本地 SQLite 数据库中，随时一键切换</p>
                </div>
              </div>
              <button onClick={() => setShowBookshelfModal(false)} className="text-zinc-400 hover:text-zinc-200 text-xs">✕</button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {storedNovels.map((sn) => {
                const isCurrent = novel?.file_name === sn.file_name;
                return (
                  <div
                    key={sn.file_name}
                    onClick={() => handleSelectStoredNovel(sn.file_name)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isCurrent
                        ? 'bg-amber-500/15 border-amber-500/60 shadow-md text-amber-300'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40 text-zinc-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-xs">{sn.title}</span>
                        {isCurrent && (
                          <span className="text-[9px] bg-amber-500 text-zinc-950 font-bold px-1.5 py-0.2 rounded">
                            当前阅读中
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                        <span>{sn.total_chapters} 章节</span>
                        <span>{sn.total_words.toLocaleString()} 字</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(sn.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteStoredNovel(sn.file_name, e)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded transition-colors"
                        title="从本地书架移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-amber-400 font-semibold flex items-center gap-0.5">
                        <span>切换</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}

              {storedNovels.length === 0 && (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  本地书库暂无小说，请先导入 .txt 小说文件
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-xs">
              <span className="text-zinc-500 text-[11px]">💡 所有小说正文与拆解结果保存在本地 SQLite 数据库中</span>
              <button
                onClick={() => setShowBookshelfModal(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模态框：提炼创作模版与复用 */}
      {showBlueprintModal && novel && (
        <ExportBlueprintModal
          novel={novel}
          analyses={analyses}
          characters={globalCharacters}
          worldElements={globalWorldElements}
          onClose={() => setShowBlueprintModal(false)}
        />
      )}
    </div>
  );
};
