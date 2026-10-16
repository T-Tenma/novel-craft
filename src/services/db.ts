import { invoke } from '@tauri-apps/api/core';
import { NovelMetadata, ChapterAnalysis } from '../types';

export interface NovelSummary {
  id: string;
  title: string;
  file_name: string;
  total_words: number;
  total_chapters: number;
  analyzed_chapters: number;
  created_at: string;
}

// 检查是否在 Tauri 原生桌面环境中
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// 保存小说到数据库与历史书架索引
export async function persistNovel(novel: NovelMetadata): Promise<void> {
  const novelId = novel.file_name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');

  if (isTauri()) {
    try {
      await invoke('db_save_novel', {
        novelId,
        title: novel.file_name.replace(/\.[^/.]+$/, ''),
        fileName: novel.file_name,
        totalWords: novel.total_words,
        totalChapters: novel.total_chapters,
        chapters: novel.chapters,
      });
      return;
    } catch (e) {
      console.warn('Tauri SQLite 写入失败，fallback 到本地存储', e);
    }
  }

  // 浏览器 IndexedDB / LocalStorage 备份
  try {
    localStorage.setItem(`novel_meta_${novelId}`, JSON.stringify(novel));

    // 更新历史小说索引表
    const listRaw = localStorage.getItem('novel_bookshelf_index');
    let list: Array<{ id: string; file_name: string; title: string; total_words: number; total_chapters: number; updated_at: string }> = [];
    if (listRaw) {
      try { list = JSON.parse(listRaw); } catch {}
    }
    const existingIdx = list.findIndex(item => item.file_name === novel.file_name);
    const itemData = {
      id: novelId,
      file_name: novel.file_name,
      title: novel.file_name.replace(/\.[^/.]+$/, ''),
      total_words: novel.total_words,
      total_chapters: novel.total_chapters,
      updated_at: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      list[existingIdx] = itemData;
    } else {
      list.unshift(itemData);
    }
    localStorage.setItem('novel_bookshelf_index', JSON.stringify(list));
  } catch (e) {
    console.error('LocalStorage 存储限制', e);
  }
}

// 获取历史导入的小说书架列表
export async function listStoredNovels(): Promise<NovelSummary[]> {
  if (isTauri()) {
    try {
      const records = await invoke<any[]>('db_list_novels');
      return records.map(r => ({
        id: r.id,
        title: r.title,
        file_name: r.file_name,
        total_words: r.total_words,
        total_chapters: r.total_chapters,
        analyzed_chapters: r.analyzed_chapters,
        created_at: r.created_at,
      }));
    } catch (e) {
      console.warn('从 Tauri 获取小说列表失败，fallback 到本地存储', e);
    }
  }

  // 浏览器 LocalStorage 降级
  const listRaw = localStorage.getItem('novel_bookshelf_index');
  if (listRaw) {
    try {
      const list = JSON.parse(listRaw);
      return list.map((item: any) => ({
        id: item.id,
        title: item.title,
        file_name: item.file_name,
        total_words: item.total_words,
        total_chapters: item.total_chapters,
        analyzed_chapters: 0,
        created_at: item.updated_at,
      }));
    } catch {}
  }

  return [];
}

// 从历史数据库中完整加载某部小说全部章节
export async function loadNovelFromStorage(fileName: string): Promise<NovelMetadata | null> {
  const novelId = fileName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');

  if (isTauri()) {
    try {
      const chaptersDb = await invoke<any[]>('db_get_chapters', { novelId });
      if (chaptersDb && chaptersDb.length > 0) {
        const chapters = chaptersDb.map(c => ({
          id: c.id,
          title: c.title,
          word_count: c.word_count,
          preview: c.content?.slice(0, 150) || '',
          content: c.content,
        }));
        const totalWords = chapters.reduce((acc, c) => acc + c.word_count, 0);
        return {
          file_name: fileName,
          total_words: totalWords,
          total_chapters: chapters.length,
          chapters,
        };
      }
    } catch (e) {
      console.warn('从 Tauri 恢复小说正文失败，使用本地缓存', e);
    }
  }

  // 浏览器 LocalStorage 降级
  const raw = localStorage.getItem(`novel_meta_${novelId}`);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }

  return null;
}

// 删除历史小说
export async function deleteStoredNovel(fileName: string): Promise<void> {
  const novelId = fileName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
  localStorage.removeItem(`novel_meta_${novelId}`);

  const listRaw = localStorage.getItem('novel_bookshelf_index');
  if (listRaw) {
    try {
      const list = JSON.parse(listRaw);
      const filtered = list.filter((i: any) => i.file_name !== fileName);
      localStorage.setItem('novel_bookshelf_index', JSON.stringify(filtered));
    } catch {}
  }
}

// 保存单章拆解结果
export async function persistChapterAnalysis(
  novelFileName: string,
  chapterId: number,
  analysis: ChapterAnalysis
): Promise<void> {
  const novelId = novelFileName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');

  if (isTauri()) {
    try {
      await invoke('db_update_chapter_analysis', {
        novelId,
        chapterId,
        analysis: {
          summary: analysis.summary,
          tension_score: analysis.tension_score,
          narrative_hook: analysis.narrative_hook,
          technique_notes: analysis.technique_notes,
          characters: analysis.characters,
          world_elements: analysis.world_elements,
        },
      });
      return;
    } catch (e) {
      console.warn('Tauri 更新拆解失败，使用本地存储', e);
    }
  }

  // 本地存储备份
  try {
    const key = `novel_analysis_${novelId}_${chapterId}`;
    localStorage.setItem(key, JSON.stringify(analysis));
  } catch (e) {
    console.error('本地存储单章拆解失败', e);
  }
}

// 加载某本小说的所有已拆解章节缓存
export async function loadCachedAnalyses(
  novelFileName: string,
  chapterIds: number[]
): Promise<Record<number, ChapterAnalysis>> {
  const novelId = novelFileName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
  const result: Record<number, ChapterAnalysis> = {};

  if (isTauri()) {
    try {
      const records = await invoke<any[]>('db_get_chapters', { novelId });
      for (const r of records) {
        if (r.status === 'completed' && r.summary) {
          result[r.id] = {
            chapter_id: r.id,
            chapter_title: r.title,
            summary: r.summary,
            tension_score: r.tension_score ?? 5,
            narrative_hook: r.narrative_hook ?? '',
            technique_notes: r.technique_notes ?? '',
            characters: [],
            world_elements: [],
          };
        }
      }
      return result;
    } catch (e) {
      console.warn('从 Tauri 读缓存失败，转本地 storage', e);
    }
  }

  // 浏览器 LocalStorage 降级
  for (const id of chapterIds) {
    const key = `novel_analysis_${novelId}_${id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        result[id] = JSON.parse(raw);
      } catch {}
    }
  }

  return result;
}
