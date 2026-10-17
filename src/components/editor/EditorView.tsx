import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNovelStore, type AiEdit } from '../../stores/novelStore';
import { findChapter, locateChapter, resolveReferenceChapterId, chapterTitleOrDefault, type ChapterWriteMode } from '../../stores/chapterOps';
import { appendUniqueBy, validateUniqueName, insertAt, DEFAULT_NAME_MAX_LENGTH } from '../../utils/collections';
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

// 人物卡状态；「退场/阵亡」会写进 AI 前情与防吃设定，免得把死去的人物写活
const CHARACTER_STATUSES: CharacterItem['status'][] = ['新登场', '已有角色', '退场/阵亡'];
import { ExportProjectModal } from './ExportProjectModal';
import { ConsistencyReportBanner } from './ConsistencyReportBanner';
import { VolumeFormModal } from './VolumeFormModal';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollHint } from '../../hooks/useScrollHint';
import { diagnosisFailureNotice } from '../../utils/diagnosisNotice';
import { boundTo, type ChapterBound } from '../../utils/chapterBound';
import { adoptRewrite, adoptAllRewrites, pendingRewrites, shouldRequestCritique, nextCritiqueStart, CRITIQUE_BATCH_SIZE } from '../../utils/critique';
import { buildStoryContext, buildPreviousChapterContext } from '../../utils/storyContext';
import { polishLengthWarning } from '../../utils/polishCheck';
import { IDEA_PROMPT_PREFIX } from '../../data/promptArsenal';
import { splitParagraphs } from '../../utils/paragraphs';
import { findSelectedIdea } from '../../stores/ideaOps';
import { EditorNotice, UNDO_NOTICE_MS, type EditorNoticeState, type EditorNoticeTone } from './EditorNotice';
import { NO_API_KEY_MESSAGE, formatActionError } from '../../services/llmErrors';
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
  Menu,
  Undo2,
  CheckCheck
} from 'lucide-react';


// 会改写正文的 AI 操作（同一时间只允许一个）
type AiWriteKind = 'generate' | 'expand' | 'polish' | 'prompt';
interface AiWriteTask {
  kind: AiWriteKind;
  label: string;
  chapterId: string;
}

export const EditorView: React.FC = () => {
  const { 
    draftTitle, 
    setDraftTitle, 
    draftContent, 
    setDraftContent, 
    analyses,
    selectedChapterId,
    novel,
    setChapterReference,
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
    updateVolume,
    deleteVolume,
    createChapter,
    updateChapterStatus,
    deleteChapter,
    prompts,
    authorStyles,
    selectedAuthorStyleId,
    setSelectedAuthorStyleId,
    apiBaseUrl,
    apiKey,
    modelName,
    applyAiTextToChapter,
    lastAiEdit,
    undoLastAiEdit,
    dismissLastAiEdit
  } = useNovelStore();

  // 左侧面板大模式：'projectTree' (分卷目录树) | 'myAssets' (新书人物与世界观) | 'prompts' (场景化Prompt武器库) | 'reference' (原著对照)
  const [leftNav, setLeftNav] = useState<'projectTree' | 'myAssets' | 'prompts' | 'reference'>('projectTree');
  const [assetSubTab, setAssetSubTab] = useState<'chars' | 'world'>('chars');

  // 🌟 手机端抽屉展开状态 🌟
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  // 🌟 沉浸式专注模式 (Zen Mode) 🌟
  const [isZenMode, setIsZenMode] = useState(false);
  // 手机抽屉按对话框处理：点遮罩或按 Esc 关闭，焦点锁在抽屉内，关闭后回到菜单按钮
  const closeMobileDrawer = useCallback(() => setShowMobileDrawer(false), []);
  const mobileDrawerRef = useFocusTrap<HTMLDivElement>(showMobileDrawer && !isZenMode, closeMobileDrawer);

  // 🌟 全书导出模态框 🌟
  const [showExportModal, setShowExportModal] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // 🌟 核心新功能：专业主编逐段旁批状态 🌟
  const [showCritiqueDrawer, setShowCritiqueDrawer] = useState(false);
  const [critiqueResult, setCritiqueResult] = useState<ChapterBound<DraftParagraphCritique[]> | null>(null);
  // 已采纳改写的批注（按段落序号），随新一轮批注清空；已采纳的不能再点，避免重复追加
  const [adoptedCritiques, setAdoptedCritiques] = useState<number[]>([]);
  // 一键采纳写入的那次 AI 编辑、它采纳的段号与它给出的提示：撤销这次编辑时把这些批注恢复成可采纳，并收起这条提示
  const bulkAdoptRef = useRef<{ edit: AiEdit | null; indexes: number[]; notice: string } | null>(null);
  const [isCritiquing, setIsCritiquing] = useState(false);
  // 续写方向：作者指定下一段写什么，续写成功后清空
  const [expandDirection, setExpandDirection] = useState('');

  // AI 操作加载状态：改写正文的操作共用一个任务槽（ref 防止同一帧内重复触发）
  const [aiWrite, setAiWrite] = useState<AiWriteTask | null>(null);
  const aiWriteRef = useRef<AiWriteTask | null>(null);
  const isGenerating = aiWrite?.kind === 'generate';
  const isExpanding = aiWrite?.kind === 'expand' || aiWrite?.kind === 'prompt';
  const isPolishing = aiWrite?.kind === 'polish';
  const isWritingCurrentChapter = !!aiWrite && aiWrite.chapterId === activeChapterId;
  // 改写正文的按钮在任一 AI 写作进行中时都禁用，并说明原因
  const aiWriteBusyTitle = aiWrite ? `AI 正在「${aiWrite.label}」，完成后可用` : undefined;
  // 新的 AI 写作进行中时不提供撤销上一次结果，避免与进行中的写入交错
  const canUndoAiEdit =
    !!lastAiEdit &&
    !isWritingCurrentChapter &&
    lastAiEdit.chapterId === activeChapterId &&
    lastAiEdit.appliedContent === draftContent;
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [isMapping, setIsMapping] = useState(false);

  // 诊断与冲突报告状态
  const [diagnosisResult, setDiagnosisResult] = useState<ChapterBound<RealtimeDiagnosis> | null>(null);
  const [notice, setNotice] = useState<EditorNoticeState | null>(null);
  const toolbarScroll = useScrollHint<HTMLDivElement>();
  const showNotice = (
    tone: EditorNoticeTone,
    text: string,
    extra?: Pick<EditorNoticeState, 'action' | 'durationMs'>
  ) => setNotice({ tone, text, ...extra });
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [consistencyResult, setConsistencyResult] = useState<ChapterBound<ConsistencyCheckReport> | null>(null);
  // 诊断 / 防吃设定 / 主编旁批只显示当前章节自己的结果
  const diagnosis = boundTo(diagnosisResult, activeChapterId);
  const consistencyReport = boundTo(consistencyResult, activeChapterId);
  const critiqueList = boundTo(critiqueResult, activeChapterId) ?? [];
  const critiqueParagraphCount = splitParagraphs(draftContent).length;
  const nextCritiqueFrom = critiqueList.length > 0 ? nextCritiqueStart(critiqueParagraphCount, critiqueList) : null;
  const pendingCritiques = pendingRewrites(critiqueList, adoptedCritiques);

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
  const [charError, setCharError] = useState('');

  // 编辑世界观词条状态
  const [editingWorldIdx, setEditingWorldIdx] = useState<number | null>(null);
  const [worldForm, setWorldForm] = useState<WorldElement>({
    term: '',
    category: '力量体系',
    description: ''
  });
  const [showAddWorld, setShowAddWorld] = useState(false);
  const [worldError, setWorldError] = useState('');

  // 分卷弹窗：volumeId 为 null 是新建，否则编辑该卷
  const [volumeForm, setVolumeForm] = useState<{ volumeId: string | null } | null>(null);
  const editingVolumeIndex = volumeForm?.volumeId ? volumes.findIndex((v) => v.id === volumeForm.volumeId) : -1;
  const editingVolume = editingVolumeIndex >= 0 ? volumes[editingVolumeIndex] : undefined;

  // 原著参考跟随写作章节自己的绑定，没有绑定才跟随拆解页的选中章节（见 resolveReferenceChapterId）
  const activeChapter = findChapter(volumes, activeChapterId);
  const referenceChapterId = resolveReferenceChapterId(
    activeChapter?.reference_chapter_id,
    selectedChapterId,
    novel?.chapters.map((c) => c.id) ?? []
  );
  const referenceChapter = novel?.chapters.find((c) => c.id === referenceChapterId);
  const followedChapter = novel?.chapters.find((c) => c.id === selectedChapterId);
  const currentAnalysis = referenceChapterId !== null ? analyses[referenceChapterId] ?? null : null;
  const currentIdea = findSelectedIdea(ideas, selectedIdeaId);
  const currentAuthorStyle = authorStyles.find(a => a.id === selectedAuthorStyleId) || authorStyles[0];

  const wordCount = draftContent.replace(/\s+/g, '').length;

  // AI 写作带上的前情（本卷大纲、人物与设定、前一章结尾）；读最新 store，快捷键闭包里也不会拿到旧数据
  const storyContextFor = (chapterId: string) => {
    const latest = useNovelStore.getState();
    return buildStoryContext({
      volumes: latest.volumes,
      chapterId,
      characters: latest.myCharacters,
      worldElements: latest.myWorldElements,
    });
  };

  const referenceBeatText = currentAnalysis 
    ? `参考章节：${currentAnalysis.chapter_title}\n事件摘要：${currentAnalysis.summary}\n黄金钩子：${currentAnalysis.narrative_hook}\n技法手记：${currentAnalysis.technique_notes}`
    : '遵循网文黄金开局法则：前300字建立致命危机，杜绝说明性灌水，末尾抛出强悬念（收束全卷或全书的一章按大纲收住即可）。';

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
  }, [draftContent, selectedAuthorStyleId, activeChapterId, expandDirection]);

  // 改写正文的统一入口：结果写回「发起请求时」的章节（期间该章只读），空结果不写入，写入后可撤销一步
  const runAiWrite = async (
    kind: AiWriteKind,
    label: string,
    mode: ChapterWriteMode,
    request: () => Promise<string>
  ): Promise<string | null> => {
    if (aiWriteRef.current) return null;
    if (!activeChapterId) {
      showNotice('info', '请先在左侧目录新建或选择一个章节');
      return null;
    }
    const task: AiWriteTask = { kind, label, chapterId: activeChapterId };
    aiWriteRef.current = task;
    setAiWrite(task);
    try {
      const text = await request();
      if (!text.trim()) {
        showNotice('error', formatActionError(label, '模型返回了空内容，本章未作修改'));
        return null;
      }
      if (!applyAiTextToChapter(task.chapterId, text, mode, label)) {
        showNotice('info', `${label}已完成，但原章节已被删除，结果未写入`);
        return null;
      }
      const latest = useNovelStore.getState();
      if (latest.activeChapterId !== task.chapterId) {
        const target = latest.volumes.flatMap((v) => v.chapters).find((c) => c.id === task.chapterId);
        showNotice('success', `「${label}」已完成，结果已写入发起时的章节《${chapterTitleOrDefault(target?.title ?? '')}》`);
      }
      return text;
    } catch (err: any) {
      showNotice('error', formatActionError(label, err.message));
      return null;
    } finally {
      aiWriteRef.current = null;
      setAiWrite(null);
    }
  };

  // 1. AI 启发式生成初稿范本 (注入名家文风)
  const handleGenerateInspiration = async () => {
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    if (
      draftContent.trim() &&
      !confirm(`「示范初稿」会用新生成的稿子替换本章现有的 ${wordCount} 字（完成后可撤销）。继续吗？`)
    ) {
      return;
    }
    const ideaCtx = currentIdea ? `书名《${currentIdea.title}》，题材：${currentIdea.genre}，金手指机制：${currentIdea.golden_finger}` : '';
    const chapterId = activeChapterId;
    const text = await runAiWrite('generate', '示范初稿', 'replace', () =>
      generateInspirationDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftTitle || '第一章：死局求生',
        referenceBeatText,
        ideaCtx,
        currentAuthorStyle,
        storyContextFor(chapterId)
      )
    );
    if (text) handleRunDiagnosis(text, chapterId);
  };

  // 2. AI 智能续写 (注入名家文风)
  const handleExpand = async () => {
    if (!draftContent.trim()) {
      showNotice('info', '请先输入一段正文，或点击「示范初稿」生成开头');
      return;
    }
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    const direction = expandDirection.trim();
    const text = await runAiWrite('expand', '续写', 'append', () =>
      expandStoryDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        direction
          ? `${direction}（完全按照【${currentAuthorStyle.name}】的笔触行文）`
          : `顺着当前局势自然推进剧情，完全按照【${currentAuthorStyle.name}】的笔触行文`,
        currentAuthorStyle,
        storyContextFor(activeChapterId)
      )
    );
    // 请求期间作者可能已经在写下一句方向，只清掉刚发出去的那句
    if (text && direction) setExpandDirection((current) => (current.trim() === direction ? '' : current));
  };

  // 3. AI 深度润色 (注入名家文风)
  const handlePolish = async () => {
    if (!draftContent.trim()) return;
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    const original = draftContent;
    const chapterId = activeChapterId;
    const text = await runAiWrite('polish', '润色', 'replace', () =>
      polishStoryDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        original,
        `模仿${currentAuthorStyle.name}风格`,
        currentAuthorStyle
      )
    );
    // 已切到别的章节时不覆盖「结果已写入发起时的章节」提示，撤销条也只在原章节显示
    const warning = text ? polishLengthWarning(original, text) : null;
    if (warning && useNovelStore.getState().activeChapterId === chapterId) {
      showNotice('info', warning, { durationMs: UNDO_NOTICE_MS });
    }
  };

  // 4. 实时节奏诊断
  const handleRunDiagnosis = async (contentToCheck?: string, chapterId: string = activeChapterId) => {
    const text = contentToCheck || draftContent;
    const triggeredManually = contentToCheck === undefined;
    if (!apiKey) {
      if (triggeredManually) showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    if (!text.trim()) {
      if (triggeredManually) showNotice('info', '请先输入正文');
      return;
    }
    setIsDiagnosing(true);
    try {
      const res = await diagnoseDraftRealtime(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        text,
        referenceBeatText
      );
      setDiagnosisResult({ chapterId, data: res });
    } catch (err: any) {
      // 不再用假分数兜底：失败时清掉旧诊断；自动触发的只给弱提示（见 diagnosisFailureNotice）
      setDiagnosisResult(null);
      const failure = diagnosisFailureNotice(triggeredManually, err.message);
      showNotice(failure.tone, failure.text);
    } finally {
      setIsDiagnosing(false);
    }
  };

  // 5. 核心：主编逐段旁批与精修建议 (结合名家文风审查)
  // 工具栏按钮：本章已有批注时先重新打开抽屉，不重新请求（抽屉开着时才重新批注）
  const handleCritiqueButton = () => {
    if (shouldRequestCritique(critiqueList.length > 0, showCritiqueDrawer)) handleRunParagraphCritique();
    else setShowCritiqueDrawer(true);
  };

  // startParagraph 为 0 是重新批注；大于 0 是接着批下一批，结果追加在已有批注后面
  const handleRunParagraphCritique = async (startParagraph = 0) => {
    if (!draftContent.trim()) {
      showNotice('info', '请先输入正文');
      return;
    }
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    const chapterId = activeChapterId;
    const previous = startParagraph > 0 ? critiqueList : [];
    setIsCritiquing(true);
    if (startParagraph === 0) {
      setCritiqueResult(null);
      setAdoptedCritiques([]);
      bulkAdoptRef.current = null;
    }
    setShowCritiqueDrawer(true);
    try {
      const results = await critiqueDraftParagraphsWithLLM(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        referenceBeatText,
        currentAuthorStyle,
        startParagraph,
        storyContextFor(chapterId)
      );
      const fresh = results.filter((r) => !previous.some((p) => p.index === r.index));
      setCritiqueResult({ chapterId, data: [...previous, ...fresh] });
    } catch (err: any) {
      if (previous.length === 0) setShowCritiqueDrawer(false);
      showNotice('error', formatActionError('主编旁批', err.message));
    } finally {
      setIsCritiquing(false);
    }
  };

  // 一键采纳改写示范
  const blockWhileWritingCurrentChapter = () => {
    if (!isWritingCurrentChapter) return false;
    showNotice('info', `AI 正在「${aiWrite?.label}」写入本章，完成后再修改正文`);
    return true;
  };

  const handleAdoptRewrite = (item: DraftParagraphCritique) => {
    const suggestion = item.rewrite_suggestion;
    if (!suggestion || blockWhileWritingCurrentChapter()) return;
    const result = adoptRewrite(draftContent, item.paragraph_text, suggestion, item.index);
    setDraftContent(result.content);
    setAdoptedCritiques(prev => [...prev, item.index]);
    if (result.appended) {
      showNotice('info', `没找到第 ${item.index} 段的原文（可能已改动），示范改写已追加到本章末尾`);
    } else {
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 1500);
    }
  };

  // 一键采纳：本章所有未采纳的示范改写一次替换进正文，可整体撤销；找不到原文的不追加到章末，留给作者单独采纳
  const handleAdoptAllRewrites = () => {
    if (pendingCritiques.length === 0 || blockWhileWritingCurrentChapter()) return;
    const result = adoptAllRewrites(draftContent, pendingCritiques);
    const missingText = result.missing.length > 0
      ? `第 ${result.missing.join('、')} 段的原文找不到了（可能已改动），这几条没有采纳，可单独点「采纳改写」追加到章末`
      : '';
    if (result.adopted.length === 0) {
      showNotice('info', missingText);
      return;
    }
    if (!applyAiTextToChapter(activeChapterId, result.content, 'replace', `一键采纳 ${result.adopted.length} 条改写`)) {
      showNotice('info', '请先在左侧目录新建或选择一个章节');
      return;
    }
    const notice = missingText ? `已采纳 ${result.adopted.length} 条；${missingText}` : '';
    bulkAdoptRef.current = { edit: useNovelStore.getState().lastAiEdit, indexes: result.adopted, notice };
    setAdoptedCritiques(prev => [...prev, ...result.adopted]);
    if (notice) showNotice('info', notice);
  };

  const handleUndoAiEdit = () => {
    const bulk = bulkAdoptRef.current;
    if (bulk && bulk.edit === lastAiEdit) {
      setAdoptedCritiques(prev => prev.filter(i => !bulk.indexes.includes(i)));
      setNotice(prev => (prev?.text === bulk.notice ? null : prev)); // 「已采纳 N 条」已不成立，别的提示保留
    }
    bulkAdoptRef.current = null;
    undoLastAiEdit();
  };

  // 6. AI 人设与世界观一致性冲突排查 (防吃设定)
  const handleCheckConsistency = async () => {
    if (!draftContent.trim()) {
      showNotice('info', '请先输入正文');
      return;
    }
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    const chapterId = activeChapterId;
    setIsCheckingConsistency(true);
    setConsistencyResult(null);
    try {
      const report = await checkDraftConsistency(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        myCharacters.map(c => ({ name: c.name, role: c.role, status: c.status, inner_motivation: c.inner_motivation, key_action: c.key_action })),
        myWorldElements.map(w => ({ term: w.term, category: w.category, description: w.description })),
        buildPreviousChapterContext(volumes, chapterId)
      );
      setConsistencyResult({ chapterId, data: report });
    } catch (err: any) {
      showNotice('error', formatActionError('一致性排查', err.message));
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  // 7. AI 一键映射转译原著资产
  const handleAutoMapAssets = async () => {
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    if (globalCharacters.length === 0 && globalWorldElements.length === 0) {
      showNotice('info', '原著尚未拆解出角色或世界观，请先在「研习拆解坊」拆解几章原著');
      return;
    }
    if (!currentIdea) {
      showNotice('info', '映射需要知道新书的题材：请先在「脑洞生成库」选中或采用一份大纲');
      return;
    }

    setIsMapping(true);
    try {
      const targetGenre = currentIdea.genre;
      const targetIdeaDesc = `${currentIdea.title}：${currentIdea.golden_finger}`;

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

      // 追加而不是覆盖用户已有的人设 / 设定；同名条目跳过。取最新状态，避免覆盖请求期间的手动修改
      const latest = useNovelStore.getState();
      const chars = appendUniqueBy(latest.myCharacters, mappedChars, (c) => c.name);
      const world = appendUniqueBy(latest.myWorldElements, mappedWorld, (w) => w.term);
      setMyCharacters(chars.items);
      setMyWorldElements(world.items);
      setLeftNav('myAssets');
      const skipped = chars.skipped + world.skipped;
      showNotice(
        'success',
        `映射完成：新增 ${chars.added} 个人设、${world.added} 条世界观设定` +
          (skipped > 0 ? `（${skipped} 个同名条目已存在，未覆盖）` : '')
      );
    } catch (err: any) {
      showNotice('error', formatActionError('映射迁移', err.message));
    } finally {
      setIsMapping(false);
    }
  };

  // 8. 套用 Prompt 武器库里的提示词模版
  const handleApplyPrompt = async (promptTemplate: string) => {
    if (!apiKey) {
      showNotice('error', NO_API_KEY_MESSAGE);
      return;
    }
    await runAiWrite('prompt', 'AI 技法写作', 'append', () =>
      expandStoryDraft(
        { baseUrl: apiBaseUrl, apiKey, model: modelName },
        draftContent,
        `${promptTemplate}（融入${currentAuthorStyle.name}文风）`,
        currentAuthorStyle,
        storyContextFor(activeChapterId)
      )
    );
  };

  const handleInsertText = (insertStr: string) => {
    if (blockWhileWritingCurrentChapter()) return;
    setDraftContent(draftContent + insertStr);
  };

  const handleSaveChar = () => {
    const error = validateUniqueName({
      value: charForm.name,
      existing: myCharacters.map((c) => c.name),
      label: '角色姓名',
      excludeIndex: editingCharIdx,
    });
    if (error) {
      setCharError(error);
      return;
    }
    const char = { ...charForm, name: charForm.name.trim() };
    if (editingCharIdx !== null) {
      updateMyCharacter(editingCharIdx, char);
      setEditingCharIdx(null);
    } else {
      addMyCharacter(char);
      setShowAddChar(false);
    }
    setCharError('');
    setCharForm({ name: '', role: '', status: '新登场', key_action: '', inner_motivation: '' });
  };

  const handleSaveWorld = () => {
    const error = validateUniqueName({
      value: worldForm.term,
      existing: myWorldElements.map((w) => w.term),
      label: '设定名称',
      excludeIndex: editingWorldIdx,
    });
    if (error) {
      setWorldError(error);
      return;
    }
    const element = { ...worldForm, term: worldForm.term.trim() };
    if (editingWorldIdx !== null) {
      updateMyWorldElement(editingWorldIdx, element);
      setEditingWorldIdx(null);
    } else {
      addMyWorldElement(element);
      setShowAddWorld(false);
    }
    setWorldError('');
    setWorldForm({ term: '', category: '力量体系', description: '' });
  };

  // 删除卡片后修正正在编辑的下标：删的正是编辑中的卡片就关闭表单，删的在它前面就前移一位，避免保存覆盖到别的卡片
  const handleDeleteChar = (idx: number) => {
    const deleted = myCharacters[idx];
    deleteMyCharacter(idx);
    showUndoNotice(`已删除角色「${deleted.name}」`, () => {
      setMyCharacters(insertAt(useNovelStore.getState().myCharacters, idx, deleted));
      setEditingCharIdx((cur) => (cur !== null && cur >= idx ? cur + 1 : cur));
    });
    if (editingCharIdx === idx) {
      setEditingCharIdx(null);
      setShowAddChar(false);
      setCharError('');
    } else if (editingCharIdx !== null && idx < editingCharIdx) {
      setEditingCharIdx(editingCharIdx - 1);
    }
  };

  const handleDeleteWorld = (idx: number) => {
    const deleted = myWorldElements[idx];
    deleteMyWorldElement(idx);
    showUndoNotice(`已删除设定「${deleted.term}」`, () => {
      setMyWorldElements(insertAt(useNovelStore.getState().myWorldElements, idx, deleted));
      setEditingWorldIdx((cur) => (cur !== null && cur >= idx ? cur + 1 : cur));
    });
    if (editingWorldIdx === idx) {
      setEditingWorldIdx(null);
      setShowAddWorld(false);
      setWorldError('');
    } else if (editingWorldIdx !== null && idx < editingWorldIdx) {
      setEditingWorldIdx(editingWorldIdx - 1);
    }
  };

  const showUndoNotice = (text: string, undo: () => void) =>
    showNotice('info', text, {
      durationMs: UNDO_NOTICE_MS,
      action: {
        label: '撤销',
        onClick: () => {
          undo();
          dismissNotice();
        },
      },
    });

  const handleDeleteChapter = (chapterId: string) => {
    const location = locateChapter(volumes, chapterId);
    const chapter = findChapter(volumes, chapterId);
    if (!location || !chapter) return;
    const wasActive = activeChapterId === chapterId;
    deleteChapter(chapterId);
    showUndoNotice(`已删除章节「${chapterTitleOrDefault(chapter.title)}」`, () => {
      if (!useNovelStore.getState().restoreChapter(location.volumeId, location.index, chapter)) {
        showNotice('error', '原分卷已不存在，无法恢复该章节');
        return;
      }
      if (wasActive) setActiveChapterId(chapter.id);
    });
  };

  const handleVolumeFormSubmit = (title: string, description: string) => {
    if (editingVolume) {
      updateVolume(editingVolume.id, title, description);
    } else {
      createVolume(title, description);
    }
    setVolumeForm(null);
  };

  // 删除整卷与删除章节一样不弹确认，改为可撤销；撤销后若原先在写该卷的章节，切回那一章
  const handleDeleteVolume = (volumeId: string) => {
    const index = volumes.findIndex((v) => v.id === volumeId);
    if (index < 0) return;
    const volume = volumes[index];
    const previousActiveId = activeChapterId;
    const hadActive = volume.chapters.some((c) => c.id === previousActiveId);
    deleteVolume(volumeId);
    const chapterHint = volume.chapters.length > 0 ? `及其 ${volume.chapters.length} 个章节` : '';
    showUndoNotice(`已删除分卷「${volume.title}」${chapterHint}`, () => {
      useNovelStore.getState().restoreVolume(index, volume);
      if (hadActive) setActiveChapterId(previousActiveId);
    });
  };

  // 名家文风选择器：桌面端与手机端各渲染一处（位置不同），同一时刻只显示其中一个
  const renderAuthorStyleSelector = (visibility: string) => (
    <div className={`${visibility} items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 max-md:py-0 text-xs shrink-0`}>
      <Feather className="w-3 h-3 text-amber-400 shrink-0" />
      <select
        value={selectedAuthorStyleId}
        onChange={(e) => setSelectedAuthorStyleId(e.target.value)}
        aria-label="名家文风"
        className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer text-[11px] max-w-[7.5rem] sm:max-w-none"
      >
        {authorStyles.map((author) => (
          <option key={author.id} value={author.id} className="bg-zinc-900 text-zinc-200">
            {author.name}
          </option>
        ))}
      </select>
    </div>
  );

  // 抽屉导航组件（桌面与移动端复用）
  // 侧栏内容在桌面侧栏与手机抽屉各渲染一次，placement 用来生成不重复的元素 id
  const renderSidebarContent = (placement: 'desktop' | 'drawer') => (
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
            onClick={() => setVolumeForm({ volumeId: null })}
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
              <div className="p-2.5 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between gap-2">
                <div className="truncate min-w-0">
                  <span className="font-semibold text-zinc-200 block truncate">{vol.title}</span>
                  {vol.description && (
                    <span className="text-[10px] text-zinc-500 truncate block">{vol.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setVolumeForm({ volumeId: vol.id })}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                    title="编辑分卷"
                    aria-label={`编辑分卷「${vol.title}」`}
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteVolume(vol.id)}
                    className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                    title="删除分卷"
                    aria-label={`删除分卷「${vol.title}」`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => createChapter(vol.id, `第 ${vol.chapters.length + 1} 章`)}
                    className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-[10px] flex items-center gap-0.5"
                    title="在本卷中新增章节"
                  >
                    <FilePlus className="w-3 h-3" />
                    <span>加章</span>
                  </button>
                </div>
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
                          <span className="font-medium truncate">{chapterTitleOrDefault(ch.title)}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 ml-4 font-mono">{ch.word_count} 字</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* 外层按钮透明、手机端撑到 36px 可点区域，底色留在内层小标签上 */}
                        <button
                          onClick={() => updateChapterStatus(ch.id, ch.status === 'completed' ? 'draft' : 'completed')}
                          className="text-[10px] text-zinc-400 hover:text-zinc-200 max-md:min-w-9"
                          title="切换定稿状态"
                        >
                          <span className="inline-block px-1 py-0.5 rounded bg-zinc-950">{ch.status === 'completed' ? '已定稿' : '草稿'}</span>
                        </button>
                        <button
                          onClick={() => handleDeleteChapter(ch.id)}
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
                  setCharError('');
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
                  setWorldError('');
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
                      maxLength={DEFAULT_NAME_MAX_LENGTH}
                      aria-invalid={!!charError}
                      onChange={(e) => {
                        setCharForm({ ...charForm, name: e.target.value });
                        setCharError('');
                      }}
                      className={`w-full bg-zinc-900 border rounded px-2 py-1 text-xs ${charError ? 'border-rose-500/60' : 'border-zinc-800'}`}
                    />
                    {charError && <p role="alert" className="text-[11px] text-rose-400">{charError}</p>}
                    <input
                      type="text"
                      placeholder="身份定位 (如: 男主 / 贫民窟脑机散修)"
                      value={charForm.role}
                      onChange={(e) => setCharForm({ ...charForm, role: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    />
                    <select
                      aria-label="角色状态"
                      value={charForm.status}
                      onChange={(e) => setCharForm({ ...charForm, status: e.target.value as CharacterItem['status'] })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs"
                    >
                      {CHARACTER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
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
                        onClick={() => { setShowAddChar(false); setEditingCharIdx(null); setCharError(''); }}
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

                {myCharacters.length === 0 && !showAddChar && (
                  <p className="py-6 text-center text-[11px] text-zinc-500 leading-relaxed">
                    还没有人物卡。点「+ 加人物」手动创建；拆解过原著后，也可以点「映射」把原著角色转译成新书人物
                  </p>
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
                      {c.status === '退场/阵亡' && <span className="mr-auto ml-1.5 text-[10px] text-zinc-500">已退场/阵亡</span>}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingCharIdx(idx);
                            setCharForm(c);
                            setCharError('');
                            setShowAddChar(true);
                          }}
                          aria-label={`编辑人物「${c.name}」`}
                          title="编辑"
                          className="text-zinc-500 hover:text-zinc-300 p-1.5 md:p-0.5"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteChar(idx)}
                          aria-label={`删除人物「${c.name}」`}
                          title="删除"
                          className="text-zinc-500 hover:text-rose-400 p-1.5 md:p-0.5"
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
                      maxLength={DEFAULT_NAME_MAX_LENGTH}
                      aria-invalid={!!worldError}
                      onChange={(e) => {
                        setWorldForm({ ...worldForm, term: e.target.value });
                        setWorldError('');
                      }}
                      className={`w-full bg-zinc-900 border rounded px-2 py-1 text-xs ${worldError ? 'border-rose-500/60' : 'border-zinc-800'}`}
                    />
                    {worldError && <p role="alert" className="text-[11px] text-rose-400">{worldError}</p>}
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
                        onClick={() => { setShowAddWorld(false); setEditingWorldIdx(null); setWorldError(''); }}
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

                {myWorldElements.length === 0 && !showAddWorld && (
                  <p className="py-6 text-center text-[11px] text-zinc-500 leading-relaxed">
                    还没有设定词条。点「+ 加设定」记录力量体系、势力与规则，防吃设定会据此检查正文
                  </p>
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
                        <span className="text-[10px] bg-zinc-950 text-zinc-500 px-1 rounded">{w.category}</span>
                        <button
                          onClick={() => {
                            setEditingWorldIdx(idx);
                            setWorldForm(w);
                            setWorldError('');
                            setShowAddWorld(true);
                          }}
                          aria-label={`编辑设定「${w.term}」`}
                          title="编辑"
                          className="text-zinc-500 hover:text-zinc-300 p-1.5 md:p-0.5"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteWorld(idx)}
                          aria-label={`删除设定「${w.term}」`}
                          title="删除"
                          className="text-zinc-500 hover:text-rose-400 p-1.5 md:p-0.5"
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
            💡 <strong>名家技法 Prompt 武器库</strong>：点击任意卡片，AI 将以该场景手法接续正文。标「本书」的是在脑洞页采用大纲时按这本书生成的。
          </div>

          {prompts.map((p) => (
            <div key={p.id} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2 hover:border-amber-500/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-100 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  {p.name}
                </span>
                <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded shrink-0">
                  {p.id.startsWith(IDEA_PROMPT_PREFIX) ? `本书 · ${p.category_label}` : p.category_label}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{p.description}</p>

              <button
                onClick={() => {
                  handleApplyPrompt(p.prompt_template);
                  setShowMobileDrawer(false);
                }}
                disabled={!!aiWrite}
                title={aiWriteBusyTitle}
                className="w-full py-1.5 rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 text-[10px] font-medium transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-800 disabled:hover:text-zinc-300"
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
          {novel && activeChapter && (
            <div className="space-y-1">
              <label htmlFor={`reference-chapter-select-${placement}`} className="block text-[11px] text-zinc-400">
                「{chapterTitleOrDefault(activeChapter.title)}」参考的原著章节
              </label>
              <select
                id={`reference-chapter-select-${placement}`}
                value={activeChapter.reference_chapter_id !== undefined && referenceChapterId === activeChapter.reference_chapter_id ? String(referenceChapterId) : ''}
                onChange={(e) =>
                  setChapterReference(activeChapter.id, e.target.value === '' ? undefined : Number(e.target.value))
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">跟随拆解页当前章节{followedChapter ? `（${followedChapter.title}）` : ''}</option>
                {novel.chapters.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.title}{analyses[c.id] ? ` · ★${analyses[c.id].tension_score}` : '（未拆解）'}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                  {currentAnalysis.narrative_hook || <span className="text-zinc-500">模型未给出</span>}
                </div>
                <div className="text-[11px] text-zinc-400">
                  <strong className="text-purple-400 block mb-0.5">名家技法手记:</strong>
                  {currentAnalysis.technique_notes || <span className="text-zinc-500">模型未给出</span>}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                <span className="font-semibold text-blue-400 block text-[11px]">
                  原著角色定位原型 ({globalCharacters.length} 位)
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {globalCharacters.length === 0 && (
                    <p className="text-[11px] text-zinc-500">拆解原著章节后，出场角色会自动汇总到这里</p>
                  )}
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
            <div className="p-4 text-center text-zinc-500 leading-relaxed">
              {!novel
                ? '尚未载入原著小说，请先在「研习拆解坊」导入或从书库打开一本小说'
                : referenceChapter
                  ? `「${referenceChapter.title}」尚未拆解，在研习拆解坊点击「逆向拆解」后，这里会显示该章的钩子与技法`
                  : '请在上方选择本章参考的原著章节'}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-zinc-950 text-zinc-100 relative pb-mobile-nav md:pb-0">
      {/* 桌面端左侧固定抽屉 */}
      {!isZenMode && (
        <aside className="w-84 border-r border-zinc-800 bg-zinc-900/30 hidden md:flex flex-col shrink-0 overflow-hidden">
          {renderSidebarContent('desktop')}
        </aside>
      )}

      {/* 🌟 手机端滑出抽屉 (Mobile Bottom Sheet / Side Drawer) 🌟 */}
      {showMobileDrawer && !isZenMode && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeMobileDrawer();
          }}
        >
          <div
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="创作大纲与资产"
            tabIndex={-1}
            className="bg-zinc-900 border-t border-zinc-800 rounded-t-2xl max-h-[80dvh] pb-[env(safe-area-inset-bottom)] flex flex-col overflow-hidden animate-slide-in-bottom motion-reduce:animate-none focus:outline-none"
          >
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <span className="text-xs font-bold text-zinc-200">创作大纲与资产</span>
              <button onClick={closeMobileDrawer} className="text-zinc-400 p-1 text-xs">✕ 关闭</button>
            </div>
            {/* 抽屉遮罩会盖住编辑区的提示条，这里同步显示一份，保证在抽屉里删除后能直接点「撤销」 */}
            <EditorNotice notice={notice} onDismiss={dismissNotice} />
            <div className="flex-1 flex flex-col overflow-hidden">
              {renderSidebarContent('drawer')}
            </div>
          </div>
        </div>
      )}

      {/* 2. 中间沉浸式编辑器 + AI 赋能操作条 */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {/* 编辑器顶栏与 AI 写作套件 (手机端横向滑动操作条；桌面端宽度不足时标题与工具栏分两行，工具栏可换行，避免「送审」等按钮被挤出视野) */}
        <div className="border-b border-zinc-800 px-3 md:px-5 py-2.5 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-2.5 bg-zinc-900/40 shrink-0">
          <div className="flex items-center justify-between gap-2">
            {/* min-w-0：手机端输入框为 16px 时默认宽度变大，不加会撑破顶栏 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
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
                className="bg-transparent text-xs md:text-sm font-semibold text-zinc-100 focus:outline-none flex-1 min-w-0 max-md:min-h-9 md:w-64 border-b border-transparent focus:border-amber-500 pb-0.5"
              />
            </div>

            {/* 名家文风选择器：桌面端在标题右侧，手机端移到工具栏首位，把整行留给章节标题 */}
            {renderAuthorStyleSelector('hidden md:flex')}
          </div>

          {/* AI 写作工具栏 (手机端可横向滚动；还有按钮藏在哪一侧，哪一侧就渐隐提示可滑动) */}
          <div
            ref={toolbarScroll.ref}
            style={{ maskImage: toolbarScroll.mask, WebkitMaskImage: toolbarScroll.mask }}
            className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 md:flex-wrap md:overflow-visible scrollbar-none"
          >
            {renderAuthorStyleSelector('flex md:hidden')}
            <button
              onClick={handleGenerateInspiration}
              disabled={!!aiWrite}
              title={aiWriteBusyTitle}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-zinc-950 font-semibold rounded-md text-xs shadow-md shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>示范初稿</span>
            </button>

            <button
              onClick={handleExpand}
              disabled={!!aiWrite}
              title={aiWriteBusyTitle}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isExpanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-blue-400" />}
              <span>续写</span>
            </button>

            <button
              onClick={handlePolish}
              disabled={!!aiWrite}
              title={aiWriteBusyTitle}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isPolishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-purple-400" />}
              <span>润色</span>
            </button>

            {/* 逐段主编旁批 */}
            <button
              onClick={handleCritiqueButton}
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
              title={isZenMode ? '退出专注模式' : '专注模式'}
              aria-label={isZenMode ? '退出专注模式' : '专注模式'}
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
          <div className="absolute top-16 right-4 md:right-8 z-40 bg-zinc-900 border border-emerald-500/40 text-emerald-400 text-xs px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-1.5 animate-fade-in motion-reduce:animate-none">
            <Save className="w-3.5 h-3.5" />
            <span>已保存</span>
          </div>
        )}

        {/* AI 写入状态：进行中（本章只读）/ 完成后可撤销一步 */}
        {isWritingCurrentChapter && (
          <div role="status" className="px-3 md:px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-300 shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>AI 正在「{aiWrite?.label}」，完成前本章暂不可编辑…</span>
          </div>
        )}
        {canUndoAiEdit && lastAiEdit && (
          <div className="px-3 md:px-6 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-2 text-[11px] shrink-0">
            <span className="text-zinc-300">已完成「{lastAiEdit.label}」并写入本章。</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleUndoAiEdit}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>撤销</span>
              </button>
              <button onClick={dismissLastAiEdit} aria-label="关闭撤销提示" className="text-zinc-500 hover:text-zinc-300 px-1">✕</button>
            </div>
          </div>
        )}

        <EditorNotice notice={notice} onDismiss={dismissNotice} />

        {/* 实时节奏诊断状态条 */}
        {diagnosis && (
          <div className="px-3 md:px-6 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between text-xs animate-fade-in motion-reduce:animate-none shrink-0">
            <div className="flex items-center gap-3 overflow-x-auto text-[11px] whitespace-nowrap">
              <span className="text-zinc-400">吻合度: <strong className={diagnosis.match_score >= 80 ? 'text-emerald-400' : 'text-amber-400'}>{diagnosis.match_score}%</strong></span>
              <span className="text-zinc-400">张力: <strong className="text-amber-400">★{diagnosis.tension_score}</strong></span>
              <span className="text-zinc-300 font-sans border-l border-zinc-800 pl-2">💡 {diagnosis.instant_feedback}</span>
            </div>
            <button onClick={() => setDiagnosisResult(null)} aria-label="关闭诊断结果" className="text-zinc-500 hover:text-zinc-300 text-xs pl-2">✕</button>
          </div>
        )}

        {/* 防吃设定一致性检测报告横幅 */}
        {consistencyReport && (
          <ConsistencyReportBanner report={consistencyReport} onClose={() => setConsistencyResult(null)} />
        )}

        {/* 正文输入主画布 */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          <div className={`flex-1 overflow-y-auto w-full flex flex-col transition-all duration-300 ${
            isZenMode ? 'p-6 md:p-12 max-w-3xl mx-auto' : 'p-4 md:p-8 max-w-4xl mx-auto'
          }`}>
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              readOnly={isWritingCurrentChapter}
              aria-busy={isWritingCurrentChapter}
              placeholder={`在此仿写...当前文风：【${currentAuthorStyle.name}】`}
              className={`w-full flex-1 bg-transparent text-zinc-200 font-serif leading-loose resize-none focus:outline-none placeholder:text-zinc-700 select-text ${
                isZenMode ? 'text-base min-h-[600px]' : 'text-sm min-h-[400px]'
              } ${isWritingCurrentChapter ? 'opacity-60 cursor-wait' : ''}`}
            />

            <div className="pt-3 flex items-center gap-2 border-t border-zinc-800/60">
              <input
                value={expandDirection}
                onChange={(e) => setExpandDirection(e.target.value)}
                onKeyDown={(e) => {
                  // 输入法确认候选的回车不算：WebKit 里那次 keydown 的 isComposing 已是 false，但 keyCode 为 229
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    handleExpand();
                  }
                }}
                maxLength={200}
                aria-label="续写方向"
                placeholder="续写方向（可选）：下一段写什么，回车续写；留空则顺着剧情写"
                className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 focus:border-amber-500/60 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
              />
              <button
                onClick={handleExpand}
                disabled={!!aiWrite}
                title={aiWriteBusyTitle}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isExpanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-blue-400" />}
                <span>续写</span>
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs text-zinc-500 font-mono">
              <span className="flex items-center gap-2">
                <span>{wordCount} 字</span>
                <span className="text-amber-400/80 font-sans truncate">✦ {currentAuthorStyle.name}</span>
              </span>
              <span className="text-[10px] hidden sm:inline">{isZenMode ? '🌿 专注模式' : '快捷键: Cmd/Ctrl+J 续写'}</span>
            </div>
          </div>

          {/* 右侧主编逐段旁批抽屉：手机全屏覆盖；平板 / 小桌面（< xl）在右侧浮层覆盖，不挤占正文；xl 起才作为并排侧栏 */}
          {showCritiqueDrawer && !isZenMode && (
            <aside className="w-full sm:w-96 border-l border-zinc-800 bg-zinc-900 xl:bg-zinc-900/60 flex flex-col shrink-0 overflow-hidden absolute xl:relative inset-y-0 right-0 xl:inset-auto z-40 xl:z-auto shadow-2xl shadow-black/60 xl:shadow-none animate-slide-in-right motion-reduce:animate-none">
              <div className="h-11 border-b border-zinc-800 px-3 flex items-center justify-between bg-zinc-950">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MessageSquareCode className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-200 truncate">白金主编逐段批注与改写</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {pendingCritiques.length > 0 && (
                    <button
                      onClick={handleAdoptAllRewrites}
                      disabled={isWritingCurrentChapter || isCritiquing}
                      title={
                        isWritingCurrentChapter ? aiWriteBusyTitle
                          : isCritiquing ? '主编正在批注后面的段落，完成后可一键采纳'
                          : `把 ${pendingCritiques.length} 条示范改写一次替换进正文，可撤销`
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 text-[11px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500/20 disabled:hover:text-amber-300"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>一键采纳 {pendingCritiques.length}</span>
                    </button>
                  )}
                  {critiqueList.length > 0 && !isCritiquing && (
                    <button onClick={() => handleRunParagraphCritique()} className="text-[11px] text-zinc-400 hover:text-amber-300 px-2 py-1 rounded whitespace-nowrap">
                      重新批注
                    </button>
                  )}
                  <button onClick={() => setShowCritiqueDrawer(false)} aria-label="关闭主编旁批" className="text-zinc-500 hover:text-zinc-300 text-xs p-1">✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
                {isCritiquing && critiqueList.length === 0 ? (
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
                            {/* 采纳后抽屉保持打开（手机端也是），其余批注可以接着看；关掉抽屉看正文，再点「主编旁批」即可回来 */}
                            {adoptedCritiques.includes(item.index) ? (
                              <span className="px-2.5 py-1 text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>已采纳</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAdoptRewrite(item)}
                                disabled={isWritingCurrentChapter}
                                title={isWritingCurrentChapter ? aiWriteBusyTitle : undefined}
                                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500/20 disabled:hover:text-amber-300"
                              >
                                <Check className="w-3 h-3" />
                                <span>采纳改写</span>
                              </button>
                            )}
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

              {/* 每次批 CRITIQUE_BATCH_SIZE 段：说明批到了哪里，没批完的可以接着批 */}
              {critiqueList.length > 0 && (
                <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                  {isCritiquing ? (
                    <span className="flex items-center gap-1.5 text-amber-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>主编正在批注后面的段落…</span>
                    </span>
                  ) : nextCritiqueFrom === null ? (
                    <span>全章 {critiqueParagraphCount} 段已批注完</span>
                  ) : (
                    <>
                      <span>已批注到第 {nextCritiqueFrom} 段，共 {critiqueParagraphCount} 段</span>
                      <button
                        onClick={() => handleRunParagraphCritique(nextCritiqueFrom)}
                        className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold whitespace-nowrap"
                      >
                        继续批注第 {nextCritiqueFrom + 1}–{Math.min(nextCritiqueFrom + CRITIQUE_BATCH_SIZE, critiqueParagraphCount)} 段
                      </button>
                    </>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </main>

      {/* 新建 / 编辑分卷模态框 */}
      {volumeForm && (
        <VolumeFormModal
          initial={editingVolume ? { title: editingVolume.title, description: editingVolume.description } : undefined}
          existingTitles={volumes.map((v) => v.title)}
          editingIndex={editingVolume ? editingVolumeIndex : undefined}
          onSubmit={handleVolumeFormSubmit}
          onClose={() => setVolumeForm(null)}
        />
      )}

      {/* 全书归档导出模态框 */}
      {showExportModal && (
        <ExportProjectModal onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
};
