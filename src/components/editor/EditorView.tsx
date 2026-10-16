import React, { useState, useEffect } from 'react';
import { useNovelStore } from '../../stores/novelStore';
import { 
  generateInspirationDraft, 
  expandStoryDraft, 
  polishStoryDraft, 
  diagnoseDraftRealtime,
  mapAssetsToNewStory,
  checkDraftConsistency,
  critiqueDraftParagraphsWithLLM,
  RealtimeDiagnosis,
  ConsistencyCheckReport
} from '../../services/llm';
import { CharacterItem, WorldElement, DraftParagraphCritique } from '../../types';
import { ExportProjectModal } from './ExportProjectModal';
import { 
  Send, 
  BookOpen,
  Users, 
  Globe, 
  Sparkles, 
  Wand2, 
  Zap, 
  Compass, 
  Loader2,
  PenTool,
  Trash2,
  Edit2,
  RefreshCw,
  FolderTree,
  CheckCircle2,
  Circle,
  FolderPlus,
  FilePlus,
  ShieldCheck,
  Maximize2,
  Minimize2,
  FileDown,
  Save,
  MessageSquareCode,
  Check,
  Feather,
  Menu
} from 'lucide-react';

export const EditorView: React.FC = () => {
  const { 
    draftTitle, 
    setDraftTitle, 
    draftContent, 
    setDraftContent, 
    analyses,
    selectedChapterId,
    setActiveTab,
    ideas,
    selectedIdeaId,
    globalCharacters,
    globalWorldElements,
    myCharacters,
    addMyCharacter,
    updateMyCharacter,
    deleteMyCharacter,
    setMyCharacters,
    myWorldElements,
    addMyWorldElement,
    updateMyWorldElement,
    deleteMyWorldElement,
    setMyWorldElements,
    volumes,
    activeChapterId,
    setActiveChapterId,
    createVolume,
    createChapter,
    updateChapterStatus,
    deleteChapter,
    prompts,
    authorStyles,
    selectedAuthorStyleId,
    setSelectedAuthorStyleId,
    apiBaseUrl,
    apiKey,
    modelName
  } = useNovelStore();

  // 左侧面板大模式：'projectTree' (分卷目录树) | 'myAssets' (新书人物与世界观) | 'prompts' (场景化Prompt武器库) | 'reference' (原著对照)
  const [leftNav, setLeftNav] = useState<'projectTree' | 'myAssets' | 'prompts' | 'reference'>('projectTree');
  const [assetSubTab, setAssetSubTab] = useState<'chars' | 'world'>('chars');

  // 🌟 手机端抽屉展开状态 🌟
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  // 🌟 沉浸式专注模式 (Zen Mode) 🌟
  const [isZenMode, setIsZenMode] = useState(false);

  // 🌟 全书导出模态框 🌟
  const [showExportModal, setShowExportModal] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // 🌟 核心新功能：专业主编逐段旁批状态 🌟
  const [showCritiqueDrawer, setShowCritiqueDrawer] = useState(false);
  const [critiqueList, setCritiqueList] = useState<DraftParagraphCritique[]>([]);
  const [isCritiquing, setIsCritiquing] = useState(false);

  // AI 操作加载状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [isMapping, setIsMapping] = useState(false);

  // 诊断与冲突报告状态
  const [diagnosis, setDiagnosis] = useState<RealtimeDiagnosis | null>(null);
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyCheckReport | null>(null);

  // 编辑角色的局部表单状态
  const [editingCharIdx, setEditingCharIdx] = useState<number | null>(null);
  const [charForm, setCharForm] = useState<CharacterItem>({
    name: '',
    role: '',
    status: '新登场',
    key_action: '',
    inner_motivation: ''
  });
  const [showAddChar, setShowAddChar] = useState(false);

  // 编辑世界观词条状态
  const [editingWorldIdx, setEditingWorldIdx] = useState<number | null>(null);
  const [worldForm, setWorldForm] = useState<WorldElement>({
    term: '',
    category: '力量体系',
    description: ''
  });
  const [showAddWorld, setShowAddWorld] = useState(false);

  // 新建分卷弹窗状态
  const [showNewVolumeModal, setShowNewVolumeModal] = useState(false);
  const [newVolumeTitle, setNewVolumeTitle] = useState('');
  const [newVolumeDesc, setNewVolumeDesc] = useState('');

  const currentAnalysis = selectedChapterId ? analyses[selectedChapterId] : null;
  const currentIdea = ideas.find(i => i.id === selectedIdeaId);
  const currentAuthorStyle = authorStyles.find(a => a.id === selectedAuthorStyleId) || authorStyles[0];

  const wordCount = draftContent.replace(/\s+/g, '').length;

  const referenceBeatText = currentAnalysis 
    ? `参考章节：${currentAnalysis.chapter_title}\n事件摘要：${currentAnalysis.summary}\n黄金钩子：${currentAnalysis.narrative_hook}\n技法手记：${currentAnalysis.technique_notes}`
    : '遵循网文黄金开局法则：前300字建立致命危机，杜绝说明性灌水，末尾抛出强悬念。';

  // 绑定全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 1500);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        handleExpand();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleRunDiagnosis();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draftContent, selectedAuthorStyleId]);

  // 1. AI 启发式生成初稿范本 (注入名家文风)
  const handleGenerateInspiration = async () => {
    if (!apiKey) {
      alert('请先在右上角【配置模型 API】配置密钥');
      return;
    }
    setIsGenerating(true);
    try {
      const ideaCtx = currentIdea ? `书名《${currentIdea.title}》，题材：${currentIdea.genre}，金手指机制：${currentIdea.golden_finger}` : '';
      const text = await generateInspirationDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftTitle || '第一章：死局求生',
        referenceBeatText,
        ideaCtx,
        currentAuthorStyle
      );
      setDraftContent(text);
      handleRunDiagnosis(text);
    } catch (err: any) {
      alert('生成初稿失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. AI 智能续写 (注入名家文风)
  const handleExpand = async () => {
    if (!draftContent.trim()) {
      alert('请先输入一段正文，或点击「AI 示范初稿」！');
      return;
    }
    if (!apiKey) {
      alert('请先配置模型 API');
      return;
    }
    setIsExpanding(true);
    try {
      const more = await expandStoryDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        `顺着当前局势推进剧情，完全按照【${currentAuthorStyle.name}】的笔触行文`,
        currentAuthorStyle
      );
      setDraftContent(draftContent + '\n\n' + more);
    } catch (err: any) {
      alert('续写失败: ' + err.message);
    } finally {
      setIsExpanding(false);
    }
  };

  // 3. AI 深度润色 (注入名家文风)
  const handlePolish = async () => {
    if (!draftContent.trim()) return;
    if (!apiKey) {
      alert('请先配置模型 API');
      return;
    }
    setIsPolishing(true);
    try {
      const polished = await polishStoryDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        `模仿${currentAuthorStyle.name}风格`,
        currentAuthorStyle
      );
      setDraftContent(polished);
    } catch (err: any) {
      alert('润色失败: ' + err.message);
    } finally {
      setIsPolishing(false);
    }
  };

  // 4. 实时节奏诊断
  const handleRunDiagnosis = async (contentToCheck?: string) => {
    const text = contentToCheck || draftContent;
    if (!text.trim() || !apiKey) return;
    setIsDiagnosing(true);
    try {
      const res = await diagnoseDraftRealtime(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        text,
        referenceBeatText
      );
      setDiagnosis(res);
    } catch {
      // 忽略
    } finally {
      setIsDiagnosing(false);
    }
  };

  // 5. 核心：主编逐段旁批与精修建议 (结合名家文风审查)
  const handleRunParagraphCritique = async () => {
    if (!draftContent.trim()) {
      alert('请先输入正文！');
      return;
    }
    if (!apiKey) {
      alert('请先配置模型 API');
      return;
    }
    setIsCritiquing(true);
    setShowCritiqueDrawer(true);
    try {
      const results = await critiqueDraftParagraphsWithLLM(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        referenceBeatText,
        currentAuthorStyle
      );
      setCritiqueList(results);
    } catch (err: any) {
      alert('主编逐段旁批失败: ' + err.message);
    } finally {
      setIsCritiquing(false);
    }
  };

  // 一键采纳改写示范
  const handleAdoptRewrite = (originalSnippet: string, suggestion: string) => {
    if (!suggestion) return;
    const paras = draftContent.split(/\n+/);
    const targetIdx = paras.findIndex(p => p.includes(originalSnippet.slice(0, 15)));
    if (targetIdx >= 0) {
      paras[targetIdx] = suggestion;
      setDraftContent(paras.join('\n\n'));
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 1500);
    } else {
      setDraftContent(draftContent + '\n\n' + suggestion);
    }
  };

  // 6. AI 人设与世界观一致性冲突排查 (防吃设定)
  const handleCheckConsistency = async () => {
    if (!draftContent.trim()) {
      alert('请先输入正文！');
      return;
    }
    if (!apiKey) {
      alert('请先配置模型 API');
      return;
    }
    setIsCheckingConsistency(true);
    setConsistencyReport(null);
    try {
      const report = await checkDraftConsistency(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        myCharacters.map(c => ({ name: c.name, role: c.role, inner_motivation: c.inner_motivation, key_action: c.key_action })),
        myWorldElements.map(w => ({ term: w.term, category: w.category, description: w.description }))
      );
      setConsistencyReport(report);
    } catch (err: any) {
      alert('一致性排查失败: ' + err.message);
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  // 7. AI 一键映射转译原著资产
  const handleAutoMapAssets = async () => {
    if (!apiKey) {
      alert('请先配置模型 API');
      return;
    }
    if (globalCharacters.length === 0 && globalWorldElements.length === 0) {
      alert('原著尚未拆解出角色或世界观，请先在「1. 研习拆解坊」拆解几章原著！');
      return;
    }

    setIsMapping(true);
    try {
      const targetGenre = currentIdea ? currentIdea.genre : '赛博道门修真';
      const targetIdeaDesc = currentIdea ? `${currentIdea.title}：${currentIdea.golden_finger}` : '底层散修脑机觉醒';

      const mapped = await mapAssetsToNewStory(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        targetGenre,
        targetIdeaDesc,
        globalCharacters.map(c => ({ name: c.name, role: c.role, inner_motivation: c.inner_motivation })),
        globalWorldElements.map(w => ({ term: w.term, category: w.category, description: w.description }))
      );

      const mappedChars: CharacterItem[] = mapped.characters.map(mc => ({
        name: mc.name,
        role: `${mc.role} (原型: ${mc.original_counterpart})`,
        status: '新登场',
        key_action: mc.key_action,
        inner_motivation: mc.inner_motivation,
      }));

      const mappedWorld: WorldElement[] = mapped.world_elements.map(mw => ({
        term: mw.term,
        category: (mw.category as any) || '力量体系',
        description: `${mw.description} [对标原著: ${mw.original_counterpart}]`,
      }));

      setMyCharacters(mappedChars);
      setMyWorldElements(mappedWorld);
      setLeftNav('myAssets');
      alert(`🎉 成功映射生成了 ${mappedChars.length} 个新书人设和 ${mappedWorld.length} 条新世界观设定！`);
    } catch (err: any) {
      alert('映射迁移失败: ' + err.message);
    } finally {
      setIsMapping(false);
    }
  };

  // 8. 套用 Prompt 武器库里的提示词模版
  const handleApplyPrompt = async (promptTemplate: string) => {
    if (!apiKey) {
      alert('请先配置模型 API');
      return;
    }
    setIsExpanding(true);
    try {
      const result = await expandStoryDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        `${promptTemplate}（融入${currentAuthorStyle.name}文风）`,
        currentAuthorStyle
      );
      setDraftContent(draftContent + '\n\n' + result);
    } catch (err: any) {
      alert('AI 写作执行失败: ' + err.message);
    } finally {
      setIsExpanding(false);
    }
  };

  const handleInsertText = (insertStr: string) => {
    setDraftContent(draftContent + insertStr);
  };

  const handleSaveChar = () => {
    if (!charForm.name.trim()) return;
    if (editingCharIdx !== null) {
      updateMyCharacter(editingCharIdx, charForm);
      setEditingCharIdx(null);
    } else {
      addMyCharacter(charForm);
      setShowAddChar(false);
    }
    setCharForm({ name: '', role: '', status: '新登场', key_action: '', inner_motivation: '' });
  };

  const handleSaveWorld = () => {
    if (!worldForm.term.trim()) return;
    if (editingWorldIdx !== null) {
      updateMyWorldElement(editingWorldIdx, worldForm);
      setEditingWorldIdx(null);
    } else {
      addMyWorldElement(worldForm);
      setShowAddWorld(false);
    }
    setWorldForm({ term: '', category: '力量体系', description: '' });
  };

  const handleCreateVolumeSubmit = () => {
    if (!newVolumeTitle.trim()) return;
    createVolume(newVolumeTitle.trim(), newVolumeDesc.trim());
    setNewVolumeTitle('');
    setNewVolumeDesc('');
    setShowNewVolumeModal(false);
  };

  // 抽屉导航组件（桌面与移动端复用）
  const renderSidebarContent = () => (
    <>
      {/* 四重视角导航栏 */}
      <div className="h-11 border-b border-zinc-800 px-2 flex items-center justify-between bg-zinc-950/70 shrink-0">
        <div className="flex bg-zinc-900 p-0.5 rounded border border-zinc-800 text-[10px]">
          <button
            onClick={() => setLeftNav('projectTree')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              leftNav === 'projectTree' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="多卷多章项目大纲树"
          >
            <FolderTree className="w-3 h-3" />
            <span>目录</span>
          </button>
          <button
            onClick={() => setLeftNav('myAssets')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              leftNav === 'myAssets' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="我的新书人物与世界观"
          >
            <Users className="w-3 h-3" />
            <span>人设设定</span>
          </button>
          <button
            onClick={() => setLeftNav('prompts')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              leftNav === 'prompts' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="场景化写作 Prompt 武器库"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>技法库</span>
          </button>
          <button
            onClick={() => setLeftNav('reference')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              leftNav === 'reference' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="原著对照"
          >
            <BookOpen className="w-3 h-3" />
            <span>原著</span>
          </button>
        </div>

        {leftNav === 'myAssets' && (
          <button
            onClick={handleAutoMapAssets}
            disabled={isMapping}
            className="flex items-center gap-0.5 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1 py-1 rounded disabled:opacity-50"
            title="一键基于原著关系网映射新设定"
          >
            {isMapping ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>映射</span>
          </button>
        )}

        {leftNav === 'projectTree' && (
          <button
            onClick={() => setShowNewVolumeModal(true)}
            className="flex items-center gap-0.5 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-1 rounded"
            title="新建分卷"
          >
            <FolderPlus className="w-3 h-3" />
            <span>加卷</span>
          </button>
        )}
      </div>

      {/* 视角 1：多卷多章项目树 */}
      {leftNav === 'projectTree' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          {volumes.map((vol) => (
            <div key={vol.id} className="rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
              <div className="p-2.5 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between">
                <div className="truncate">
                  <span className="font-semibold text-zinc-200 block truncate">{vol.title}</span>
                  {vol.description && (
                    <span className="text-[10px] text-zinc-500 truncate block">{vol.description}</span>
                  )}
                </div>
                <button
                  onClick={() => createChapter(vol.id, `第 ${vol.chapters.length + 1} 章`)}
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-[10px] flex items-center gap-0.5 shrink-0"
                  title="在本卷中新增章节"
                >
                  <FilePlus className="w-3 h-3" />
                  <span>加章</span>
                </button>
              </div>

              <div className="divide-y divide-zinc-800/40">
                {vol.chapters.map((ch) => {
                  const isActive = ch.id === activeChapterId;
                  return (
                    <div
                      key={ch.id}
                      onClick={() => {
                        setActiveChapterId(ch.id);
                        setShowMobileDrawer(false);
                      }}
                      className={`p-2.5 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isActive ? 'bg-amber-500/15 border-l-2 border-amber-500 text-amber-300' : 'hover:bg-zinc-800/30 text-zinc-300'
                      }`}
                    >
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-1.5">
                          {ch.status === 'completed' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-3 h-3 text-amber-500/60 shrink-0" />
                          )}
                          <span className="font-medium truncate">{ch.title}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 ml-4 font-mono">{ch.word_count} 字</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => updateChapterStatus(ch.id, ch.status === 'completed' ? 'draft' : 'completed')}
                          className="text-[9px] px-1 py-0.5 rounded bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                          title="切换定稿状态"
                        >
                          {ch.status === 'completed' ? '已定稿' : '草稿'}
                        </button>
                        <button
                          onClick={() => deleteChapter(ch.id)}
                          className="text-zinc-600 hover:text-rose-400 p-0.5"
                          title="删除章节"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {vol.chapters.length === 0 && (
                  <div className="p-3 text-center text-zinc-500 text-[11px]">
                    本卷暂无章节，点击右上角加章
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 视角 2：我的新书资产 */}
      {leftNav === 'myAssets' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b border-zinc-800 bg-zinc-900/40 text-[11px] px-3 py-1.5 justify-between items-center shrink-0">
            <div className="flex gap-2">
              <button
                onClick={() => setAssetSubTab('chars')}
                className={`flex items-center gap-1 ${assetSubTab === 'chars' ? 'text-amber-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Users className="w-3 h-3" />
                <span>人物卡 ({myCharacters.length})</span>
              </button>
              <button
                onClick={() => setAssetSubTab('world')}
                className={`flex items-center gap-1 ${assetSubTab === 'world' ? 'text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <Globe className="w-3 h-3" />
                <span>设定 ({myWorldElements.length})</span>
              </button>
            </div>

            {assetSubTab === 'chars' ? (
              <button
                onClick={() => {
                  setEditingCharIdx(null);
                  setCharForm({ name: '', role: '', status: '新登场', key_action: '', inner_motivation: '' });
                  setShowAddChar(true);
                }}
                className="text-[10px] text-amber-400 hover:text-amber-300"
              >
                + 加人物
              </button>
            ) : (
              <button
                onClick={() => {
                  setEditingWorldIdx(null);
                  setWorldForm({ term: '', category: '力量体系', description: '' });
                  setShowAddWorld(true);
                }}
                className="text-[10px] text-emerald-400 hover:text-emerald-300"
              >
                + 加设定
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
            {assetSubTab === 'chars' && (
              <>
                {showAddChar && (
                  <div className="p-3 rounded-lg bg-zinc-950 border border-amber-500/40 space-y-2">
                    <span className="text-[11px] font-semibold text-amber-400 block">
                      {editingCharIdx !== null ? '编辑角色信息' : '创建新书角色卡'}
                    </span>
                    <input
                      type="text"
                      placeholder="角色姓名 (如: 林宵)"
                      value={charForm.name}
                      onChange={(e) => setCharForm({ ...charForm, name: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="身份定位 (如: 男主 / 贫民窟脑机散修)"
                      value={charForm.role}
                      onChange={(e) => setCharForm({ ...charForm, role: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <textarea
                      rows={2}
                      placeholder="开篇核心行动"
                      value={charForm.key_action}
                      onChange={(e) => setCharForm({ ...charForm, key_action: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <textarea
                      rows={2}
                      placeholder="深层驱动动机与欲望"
                      value={charForm.inner_motivation}
                      onChange={(e) => setCharForm({ ...charForm, inner_motivation: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => { setShowAddChar(false); setEditingCharIdx(null); }}
                        className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:bg-zinc-800"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveChar}
                        className="px-3 py-0.5 rounded text-[10px] bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                )}

                {myCharacters.map((c, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1 group">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          handleInsertText(c.name);
                          setShowMobileDrawer(false);
                        }}
                        className="font-semibold text-zinc-100 hover:text-amber-400 flex items-center gap-1"
                        title="点击快速将角色名插入正文"
                      >
                        <span>{c.name}</span>
                        <PenTool className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 text-amber-400" />
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingCharIdx(idx);
                            setCharForm(c);
                            setShowAddChar(true);
                          }}
                          className="text-zinc-500 hover:text-zinc-300 p-0.5"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteMyCharacter(idx)}
                          className="text-zinc-500 hover:text-rose-400 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-400/90 font-mono">{c.role}</p>
                    <p className="text-[11px] text-zinc-400">动作: {c.key_action}</p>
                    <p className="text-[11px] text-zinc-300">动机: {c.inner_motivation}</p>
                  </div>
                ))}
              </>
            )}

            {assetSubTab === 'world' && (
              <>
                {showAddWorld && (
                  <div className="p-3 rounded-lg bg-zinc-950 border border-emerald-500/40 space-y-2">
                    <span className="text-[11px] font-semibold text-emerald-400 block">
                      {editingWorldIdx !== null ? '编辑设定' : '创建新书世界观设定'}
                    </span>
                    <input
                      type="text"
                      placeholder="设定名称 (如: 太上感应铜钱)"
                      value={worldForm.term}
                      onChange={(e) => setWorldForm({ ...worldForm, term: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <select
                      value={worldForm.category}
                      onChange={(e: any) => setWorldForm({ ...worldForm, category: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300"
                    >
                      <option value="力量体系">力量体系</option>
                      <option value="地理背景">地理背景</option>
                      <option value="法则规则">法则规则</option>
                      <option value="势力派系">势力派系</option>
                    </select>
                    <textarea
                      rows={2}
                      placeholder="运行机制与负面代价"
                      value={worldForm.description}
                      onChange={(e) => setWorldForm({ ...worldForm, description: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        onClick={() => { setShowAddWorld(false); setEditingWorldIdx(null); }}
                        className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:bg-zinc-800"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveWorld}
                        className="px-3 py-0.5 rounded text-[10px] bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                )}

                {myWorldElements.map((w, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1 group">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          handleInsertText(w.term);
                          setShowMobileDrawer(false);
                        }}
                        className="font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      >
                        <span>{w.term}</span>
                        <PenTool className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] bg-zinc-950 text-zinc-500 px-1 rounded">{w.category}</span>
                        <button
                          onClick={() => {
                            setEditingWorldIdx(idx);
                            setWorldForm(w);
                            setShowAddWorld(true);
                          }}
                          className="text-zinc-500 hover:text-zinc-300 p-0.5"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteMyWorldElement(idx)}
                          className="text-zinc-500 hover:text-rose-400 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400">{w.description}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* 视角 3：场景化写作 Prompt 武器库 */}
      {leftNav === 'prompts' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div className="text-[11px] text-zinc-400 leading-relaxed bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
            💡 <strong>名家技法 Prompt 武器库</strong>：点击任意卡片，AI 将以该场景手法接续正文。
          </div>

          {prompts.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 hover:border-amber-500/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-100 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  {p.name}
                </span>
                <span className="text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  {p.category_label}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{p.description}</p>

              <button
                onClick={() => {
                  handleApplyPrompt(p.prompt_template);
                  setShowMobileDrawer(false);
                }}
                disabled={isExpanding}
                className="w-full py-1.5 rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 text-[10px] font-medium transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                <span>套用此手法续写</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 视角 4：原著研习对照 */}
      {leftNav === 'reference' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          {currentAnalysis ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-zinc-900 border border-amber-500/20 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-amber-400">
                    原著参考: {currentAnalysis.chapter_title}
                  </span>
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 rounded">
                    张力: ★{currentAnalysis.tension_score}
                  </span>
                </div>
                <div className="p-2 bg-zinc-950 rounded text-zinc-300 text-[11px]">
                  <strong className="text-amber-300 block mb-0.5">原著悬念钩子 (Hook):</strong>
                  {currentAnalysis.narrative_hook}
                </div>
                <div className="text-[11px] text-zinc-400">
                  <strong className="text-purple-400 block mb-0.5">名家技法手记:</strong>
                  {currentAnalysis.technique_notes}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                <span className="font-semibold text-blue-400 block text-[11px]">
                  原著角色定位原型 ({globalCharacters.length} 位)
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {globalCharacters.map((c, i) => (
                    <div key={i} className="p-1.5 bg-zinc-950 rounded text-[11px]">
                      <span className="font-semibold text-zinc-200">{c.name}</span>
                      <span className="text-[10px] text-zinc-500 ml-1.5">({c.role})</span>
                      <p className="text-zinc-400 text-[10px] mt-0.5">{c.inner_motivation}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-zinc-500">
              尚未在拆解坊选择章节，请先在拆解坊载入小说
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-zinc-950 text-zinc-100 relative pb-14 md:pb-0">
      {/* 桌面端左侧固定抽屉 */}
      {!isZenMode && (
        <aside className="w-84 border-r border-zinc-800 bg-zinc-900/30 hidden md:flex flex-col shrink-0 overflow-hidden">
          {renderSidebarContent()}
        </aside>
      )}

      {/* 🌟 手机端滑出抽屉 (Mobile Bottom Sheet / Side Drawer) 🌟 */}
      {showMobileDrawer && !isZenMode && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-zinc-900 border-t border-zinc-800 rounded-t-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <span className="text-xs font-bold text-zinc-200">创作大纲与资产</span>
              <button onClick={() => setShowMobileDrawer(false)} className="text-zinc-400 p-1 text-xs">✕ 关闭</button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              {renderSidebarContent()}
            </div>
          </div>
        </div>
      )}

      {/* 2. 中间沉浸式编辑器 + AI 赋能操作条 */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {/* 编辑器顶栏与 AI 写作套件 (手机端支持横向滑动操作条) */}
        <div className="border-b border-zinc-800 px-3 md:px-5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-zinc-900/40 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              {/* 手机端展开侧栏按钮 */}
              <button
                onClick={() => setShowMobileDrawer(true)}
                className="md:hidden p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-amber-400 shrink-0"
                title="打开目录与人设抽屉"
              >
                <Menu className="w-4 h-4" />
              </button>

              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="章节标题..."
                className="bg-transparent text-xs md:text-sm font-semibold text-zinc-100 focus:outline-none flex-1 md:w-64 border-b border-transparent focus:border-amber-500 pb-0.5"
              />
            </div>

            {/* 名家文风选择器 */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs shrink-0">
              <Feather className="w-3 h-3 text-amber-400 shrink-0" />
              <select
                value={selectedAuthorStyleId}
                onChange={(e) => setSelectedAuthorStyleId(e.target.value)}
                className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer text-[11px] max-w-[90px] sm:max-w-none"
              >
                {authorStyles.map((author) => (
                  <option key={author.id} value={author.id} className="bg-zinc-900 text-zinc-200">
                    {author.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AI 写作工具栏 (手机端可横向滚动，极度丝滑) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={handleGenerateInspiration}
              disabled={isGenerating}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-zinc-950 font-semibold rounded-md text-xs shadow-md shadow-amber-500/10 disabled:opacity-50 shrink-0"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>示范初稿</span>
            </button>

            <button
              onClick={handleExpand}
              disabled={isExpanding}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 shrink-0"
            >
              {isExpanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-blue-400" />}
              <span>续写</span>
            </button>

            <button
              onClick={handlePolish}
              disabled={isPolishing}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 shrink-0"
            >
              {isPolishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-purple-400" />}
              <span>润色</span>
            </button>

            {/* 逐段主编旁批 */}
            <button
              onClick={handleRunParagraphCritique}
              disabled={isCritiquing}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs border transition-all shrink-0 ${
                showCritiqueDrawer 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
            >
              {isCritiquing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquareCode className="w-3.5 h-3.5 text-amber-400" />}
              <span>主编旁批</span>
            </button>

            {/* 一致性排查 */}
            <button
              onClick={handleCheckConsistency}
              disabled={isCheckingConsistency}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 shrink-0"
            >
              {isCheckingConsistency ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />}
              <span>防吃设定</span>
            </button>

            <button
              onClick={() => handleRunDiagnosis()}
              disabled={isDiagnosing}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 shrink-0"
            >
              {isDiagnosing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5 text-emerald-400" />}
              <span>诊断</span>
            </button>

            {/* 全书导出 */}
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 shrink-0"
            >
              <FileDown className="w-3.5 h-3.5 text-amber-400" />
              <span>导出</span>
            </button>

            {/* Zen 模式切换 */}
            <button
              onClick={() => setIsZenMode(!isZenMode)}
              className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700 shrink-0"
            >
              {isZenMode ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setActiveTab('review')}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold rounded-md text-xs shadow-md shadow-amber-500/10 ml-0.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>送审</span>
            </button>
          </div>
        </div>

        {/* 自动保存浮动 Toast */}
        {saveToast && (
          <div className="absolute top-16 right-4 md:right-8 z-40 bg-zinc-900 border border-emerald-500/40 text-emerald-400 text-xs px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-1.5 animate-in fade-in duration-200">
            <Save className="w-3.5 h-3.5" />
            <span>已保存</span>
          </div>
        )}

        {/* 实时节奏诊断状态条 */}
        {diagnosis && (
          <div className="px-3 md:px-6 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs animate-in fade-in duration-300 shrink-0">
            <div className="flex items-center gap-3 overflow-x-auto text-[11px] whitespace-nowrap">
              <span className="text-zinc-400">吻合度: <strong className={diagnosis.match_score >= 80 ? 'text-emerald-400' : 'text-amber-400'}>{diagnosis.match_score}%</strong></span>
              <span className="text-zinc-400">张力: <strong className="text-amber-400">★{diagnosis.tension_score}</strong></span>
              <span className="text-zinc-300 font-sans border-l border-zinc-800 pl-2">💡 {diagnosis.instant_feedback}</span>
            </div>
            <button onClick={() => setDiagnosis(null)} className="text-zinc-500 hover:text-zinc-300 text-xs pl-2">✕</button>
          </div>
        )}

        {/* 防吃设定一致性检测报告横幅 */}
        {consistencyReport && (
          <div className={`px-4 py-2.5 border-b text-xs shrink-0 animate-in fade-in duration-300 ${
            consistencyReport.is_consistent 
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${consistencyReport.is_consistent ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="font-semibold text-xs">
                  {consistencyReport.is_consistent ? '设定严密性通过' : '发现设定逻辑冲突'}
                </span>
                <span className="font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-amber-400 text-[10px]">
                  {consistencyReport.consistency_score}分
                </span>
              </div>
              <button onClick={() => setConsistencyReport(null)} className="text-zinc-400">✕</button>
            </div>
            <p className="text-[11px] text-zinc-300">{consistencyReport.overall_summary}</p>
          </div>
        )}

        {/* 正文输入主画布 */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          <div className={`flex-1 overflow-y-auto w-full flex flex-col transition-all duration-300 ${
            isZenMode ? 'p-6 md:p-12 max-w-3xl mx-auto' : 'p-4 md:p-8 max-w-4xl mx-auto'
          }`}>
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder={`在此仿写...当前文风：【${currentAuthorStyle.name}】`}
              className={`w-full flex-1 bg-transparent text-zinc-200 font-serif leading-loose resize-none focus:outline-none placeholder:text-zinc-700 select-text ${
                isZenMode ? 'text-base min-h-[600px]' : 'text-sm min-h-[400px]'
              }`}
            />

            <div className="pt-3 flex items-center justify-between border-t border-zinc-800/60 text-xs text-zinc-500 font-mono">
              <span className="flex items-center gap-2">
                <span>{wordCount} 字</span>
                <span className="text-amber-400/80 font-sans truncate">✦ {currentAuthorStyle.name}</span>
              </span>
              <span className="text-[10px] hidden sm:inline">{isZenMode ? '🌿 专注模式' : '快捷键: Cmd/Ctrl+J 续写'}</span>
            </div>
          </div>

          {/* 右侧主编逐段旁批抽屉 (手机端全屏覆盖或底部滑出) */}
          {showCritiqueDrawer && !isZenMode && (
            <aside className="w-full md:w-96 border-l border-zinc-800 bg-zinc-900/90 md:bg-zinc-900/60 flex flex-col shrink-0 overflow-hidden absolute md:relative inset-0 md:inset-auto z-40 md:z-auto animate-in slide-in-from-right duration-200">
              <div className="h-11 border-b border-zinc-800 px-3 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-1.5">
                  <MessageSquareCode className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-zinc-200">白金主编逐段批注与改写</span>
                </div>
                <button onClick={() => setShowCritiqueDrawer(false)} className="text-zinc-500 hover:text-zinc-300 text-xs p-1">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
                {isCritiquing ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 p-6">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    <p className="text-xs">主编正在逐段进行毒辣批注与精修...</p>
                  </div>
                ) : critiqueList.length > 0 ? (
                  critiqueList.map((item) => (
                    <div key={item.index} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 hover:border-amber-500/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-zinc-400 font-bold text-[10px]">第 {item.index} 段</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          item.grade.includes('优秀') 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : item.grade.includes('合格')
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : item.grade.includes('硬伤')
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}>
                          {item.grade}
                        </span>
                      </div>

                      <p className="text-zinc-200 leading-relaxed font-sans bg-zinc-950 p-2 rounded border border-zinc-800/80">
                        {item.editor_comment}
                      </p>

                      {item.rewrite_suggestion && (
                        <div className="p-2.5 rounded bg-amber-500/5 border border-amber-500/20 space-y-1.5">
                          <span className="text-[10px] text-amber-400 font-semibold block">✍️ 示范改写：</span>
                          <p className="text-zinc-300 font-serif leading-relaxed text-[11px]">
                            {item.rewrite_suggestion}
                          </p>
                          <div className="pt-1 flex justify-end">
                            <button
                              onClick={() => {
                                handleAdoptRewrite(item.paragraph_text, item.rewrite_suggestion!);
                                if (window.innerWidth < 768) {
                                  setShowCritiqueDrawer(false);
                                }
                              }}
                              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              <span>采纳改写</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-zinc-500 space-y-2">
                    <p>点击上方「主编旁批」，主编将为你写的每一段进行评级、挑刺并给出改写示范！</p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* 新建分卷模态框 */}
      {showNewVolumeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
              <FolderPlus className="w-4 h-4 text-amber-400" />
              创建新分卷
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 mb-1">分卷标题</label>
                <input
                  type="text"
                  placeholder="例如: 第三卷：深渊之门与旧神低语"
                  value={newVolumeTitle}
                  onChange={(e) => setNewVolumeTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-zinc-300 mb-1">分卷核心主线/高潮目标 (可选)</label>
                <textarea
                  rows={2}
                  placeholder="例如: 主角潜入深渊裂隙，完成序列突破并击杀初代堕落者"
                  value={newVolumeDesc}
                  onChange={(e) => setNewVolumeDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewVolumeModal(false)}
                className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleCreateVolumeSubmit}
                className="px-4 py-1.5 rounded text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
              >
                确定创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全书归档导出模态框 */}
      {showExportModal && (
        <ExportProjectModal onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
};
